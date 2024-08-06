'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoBindingGenerator = exports.methods = exports.unload = exports.load = void 0;
const path = require('path');
function load() { }
exports.load = load;
function unload() { }
exports.unload = unload;
exports.methods = {
    async updateAutoBinding(autoBindingData) {
        if (autoBindingData.prefabUuid != ``) {
            let assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', autoBindingData.prefabUuid);
            if (assetInfo) {
                AutoBindingGenerator.addGenerateQueue({ assetInfo, autoBindingData });
            }
        }
    },
    async generate() {
        AutoBindingGenerator.generate(true);
    }
};
var AutoBindingGenerator;
(function (AutoBindingGenerator) {
    let typeImportMap;
    let nodeDump;
    let autoBindingData;
    function isAutoBindingPrefab(msg) {
        if (msg.type == `cc.Prefab`) {
            if (msg.url.indexOf(`db://internal`) == 0) {
                // 系统下prefab不操作
                return false;
            }
            return true;
        }
        return false;
    }
    function isAutoBindingScript(msg) {
        if (msg.url.indexOf(`db://assets/script/game/autobinding`) == 0) {
            return true;
        }
        return false;
    }
    async function saveFile(url, contentStr) {
        // TODO Prefab删除后，对应的绑定也需要删除，Prefab移动文件夹位置，绑定也需要移动
        let result = await Editor.Message.request("asset-db", "create-asset", url, contentStr, { overwrite: true });
        return result;
    }
    function getTypeName(type) {
        let arr = type.split(`.`);
        return arr.length > 1 ? arr[1] : arr[0];
    }
    const typepRrefixConfig = {
        UITransform: `ut`,
        Sprite: `spt`,
        Label: `lbl`,
        CLabel: `lbl`,
        Button: `btn`,
        CButton: `btn`,
    };
    function getTypePrefix(type) {
        let typeName = getTypeName(type);
        if (typeName.indexOf('AutoBinding') != -1) {
            return `binding`;
        }
        let typePrefix = typepRrefixConfig[typeName];
        return typePrefix || typeName.trim().replace(/^\S/, (str) => str.toLowerCase());
    }
    /** 添加导入模块信息 */
    function addTypeImport(type, autoBindingUrl, compUrl = null) {
        let typeName = getTypeName(type);
        let importPath = ``;
        switch (typeName) {
            case `GameComponent`:
                importPath = `@oops/assets/module/common/GameComponent`;
                break;
            case `CButton`:
            case `CLabel`:
            case `CNumberSelector`:
            case `CToggle`:
            case `CToggleContainer`:
                importPath = `@oops/assets/core/gui/ccomp/${typeName}`;
                break;
            case `CPicker`:
                importPath = `@oops/assets/core/gui/ccomp/cpicker/${typeName}`;
                break;
            case `CList`:
                importPath = `@oops/assets/core/gui/ccomp/clist/${typeName}`;
                break;
            case `AutoBindingBase`:
                let autoBindingBaseUrl = 'db://assets/script/game/autobinding/AutoBindingBase.ts';
                let relativePath = path.relative(autoBindingUrl, autoBindingBaseUrl);
                relativePath = relativePath.replace(/\\/g, '/');
                relativePath = relativePath.replace('../', './');
                relativePath = relativePath.replace('.ts', '');
                importPath = relativePath;
                break;
            default:
                if (typeName.indexOf("AutoBinding") != -1) {
                    if (compUrl) {
                        let relativePath = path.relative(autoBindingUrl, compUrl);
                        relativePath = relativePath.replace(/\\/g, '/');
                        relativePath = relativePath.replace('../', './');
                        relativePath = relativePath.replace('.ts', '');
                        importPath = relativePath;
                        // TODO 后期如果同名了，typeName 需要改成对应的 typeName as xxx
                    }
                    else {
                        importPath = `./${typeName}`;
                    }
                }
                else {
                    importPath = `cc`;
                }
                break;
        }
        let typeSet = typeImportMap.get(importPath);
        if (!typeSet) {
            typeSet = new Set();
            typeImportMap.set(importPath, typeSet);
        }
        typeSet.add(typeName);
    }
    /** 获取属性名 */
    function getBiningPropertyName(type, name, nameMap) {
        let typeName = getTypePrefix(type);
        name = name.trim().replace(/^\S/, (str) => str.toUpperCase());
        name = name.replace(/_/g, (str) => ' ');
        name = name.replace(/-/g, (str) => '');
        name = name.replace(/ \S/g, (str) => ` ${str.toUpperCase()}`);
        name = name.replace(/([a-z])([A-Z])([0-9])/g, '$1$2$3');
        // 去除原节点上的组件前缀
        for (const element in typepRrefixConfig) {
            if (name.toLowerCase() != element.toLowerCase() && name.toLowerCase().startsWith(element.toLowerCase())) {
                let reg = new RegExp(`${element}`, "i");
                name = name.replace(reg, str => '');
                break;
            }
            else if (name.toLowerCase() != typepRrefixConfig[element].toLowerCase() && name.toLowerCase().startsWith(typepRrefixConfig[element].toLowerCase())) {
                let reg = new RegExp(`${typepRrefixConfig[element]}`, "i");
                name = name.replace(reg, str => '');
                break;
            }
            else if (name.toLowerCase() != typeName.toLowerCase() && name.toLowerCase().startsWith(typeName.toLowerCase())) {
                let reg = new RegExp(`${typeName}`, "i");
                name = name.replace(reg, str => '');
                break;
            }
        }
        name = name.trim();
        name = `${typeName}${name}`;
        // 重名处理
        let nameCnt = nameMap.get(name);
        if (!nameCnt) {
            nameMap.set(name, 1);
            return name;
        }
        else {
            nameMap.set(name, nameCnt + 1);
            name = `${name}${nameCnt}`;
            nameMap.set(name, 1);
        }
        return name;
    }
    function getBindingProperties() {
        return new Promise(async (resolve, reject) => {
            let nodeName = nodeDump.name.value;
            let nodeNameAutoBinding = `${nodeName}AutoBinding`;
            let nodeTreeDump = await Editor.Message.request("scene", "query-node-tree", nodeDump.uuid.value);
            let bindingProperties = [];
            let nameMap = new Map();
            let recursion = async (ndp) => {
                for (let index = 0; index < ndp.components.length; index++) {
                    const element = ndp.components[index];
                    if (autoBindingData.autoBindingMap[element.value]) {
                        let type = element.type;
                        let uuid = element.value;
                        let url = null;
                        if (type.indexOf('AutoBinding') != -1) {
                            let comp = await Editor.Message.request("scene", "query-component", uuid);
                            url = await Editor.Message.request('asset-db', 'query-url', Editor.Utils.UUID.decompressUUID(comp.cid));
                        }
                        let name = getBiningPropertyName(type, ndp.name, nameMap);
                        let compType = getTypeName(element.type);
                        if (compType != nodeNameAutoBinding && compType != `MissingScript`) {
                            bindingProperties.push({ type: type, name: name, uuid: uuid, url: url });
                        }
                    }
                }
                for (let index = 0; index < ndp.children.length; index++) {
                    const element = ndp.children[index];
                    await recursion(element);
                }
            };
            await recursion(nodeTreeDump);
            resolve(bindingProperties);
        });
    }
    let generateQueue = [];
    function addGenerateQueue(queueData) {
        generateQueue.push(queueData);
        generate(false);
    }
    AutoBindingGenerator.addGenerateQueue = addGenerateQueue;
    let isGenerate = false;
    async function generate(bQueue) {
        if (!isGenerate || bQueue) {
            let queueData = generateQueue.shift();
            if (queueData) {
                console.log(`queueData`, queueData);
                isGenerate = true;
                if (isAutoBindingPrefab(queueData.assetInfo)) {
                    autoBindingData = queueData.autoBindingData;
                    await doAutoFile(queueData.assetInfo);
                }
                else if (isAutoBindingScript(queueData.assetInfo)) {
                    autoBindingData = queueData.autoBindingData;
                    await doAutoBinding(queueData.assetInfo);
                    generate(true);
                }
            }
            isGenerate = false;
        }
    }
    AutoBindingGenerator.generate = generate;
    async function doAutoFile(msg) {
        // 根据变化的资源uuid，找到节点uuid
        let nodeuuids = await Editor.Message.request("scene", "query-nodes-by-asset-uuid", msg.uuid);
        if (nodeuuids.length > 1) {
            // 当场景中拖出来多个Prefab对象时
            Editor.Dialog.warn("当前场景中有多个相同的Prefab对象，无法生成AutoBinding");
            await Editor.Message.request('scene', 'soft-reload');
            return;
        }
        typeImportMap = new Map();
        nodeDump = await Editor.Message.request("scene", "query-node", nodeuuids[0]);
        if (!nodeDump) {
            return;
        }
        console.log(`doAutoFile start`);
        let nodeName = nodeDump.name.value;
        let nodeNameAutoBinding = `${nodeName}AutoBinding`;
        let prefabUrl = msg.url;
        let autoBindingUrl = prefabUrl.replace("db://assets/bundle/", "db://assets/script/game/autobinding/");
        autoBindingUrl = autoBindingUrl.replace(msg.name, `${nodeNameAutoBinding}.ts`);
        addTypeImport(`AutoBindingBase`, autoBindingUrl);
        addTypeImport(`_decorator`, autoBindingUrl);
        addTypeImport(`Component`, autoBindingUrl);
        let autoBinding = `
const { ccclass, property } = _decorator;

@ccclass('${nodeNameAutoBinding}')
export class ${nodeNameAutoBinding} extends AutoBindingBase {

${await (async () => {
            let bindingStrArr = [];
            let bindingProperties = await getBindingProperties();
            // console.log(`doAutoFile bindingProperties`, bindingProperties);
            bindingProperties.forEach(element => {
                let compType = getTypeName(element.type);
                addTypeImport(compType, autoBindingUrl, element.url);
                let bindingStr = `\t@property({ type:${compType}, readonly: true })\n\t${element.name}: ${compType} = null!;\n`;
                bindingStrArr.push(bindingStr);
            });
            return bindingStrArr.join(`\n`);
        })()}
}
`;
        let importStrArr = [];
        for (const [importPath, typeSet] of typeImportMap) {
            let importStr = `import { ${Array.from(typeSet).join(`, `)} } from '${importPath}'`;
            importStrArr.push(importStr);
        }
        let fileContent = `${importStrArr.join(`\n`)}\n${autoBinding}`;
        let result = await saveFile(autoBindingUrl, fileContent);
        if (result) {
            console.log(`doAutoFile success`);
            // 添加执行队列，等收到编译完成消息后，执行绑定
            addGenerateQueue({ assetInfo: result, autoBindingData });
        }
        else {
            console.log(`doAutoFile fail`);
        }
    }
    async function doAutoBinding(msg) {
        let nodeName = nodeDump.name.value;
        let nodeNameAutoBinding = `${nodeName}AutoBinding`;
        let scriptName = msg.name.split(`.`)[0];
        // console.log(`doAutoBinding nodeNameAutoBinding = ${nodeNameAutoBinding} scriptName = ${scriptName}`);
        if (nodeNameAutoBinding != scriptName) {
            return;
        }
        console.log(`doAutoBinding start`);
        let autoBindingCompDump;
        let autoBindingCompIndex;
        for (let index = 0; index < nodeDump.__comps__.length; index++) {
            const element = nodeDump.__comps__[index];
            let compType = getTypeName(element.type);
            if (nodeNameAutoBinding == compType) {
                autoBindingCompDump = element;
                autoBindingCompIndex = index;
                break;
            }
        }
        if (!autoBindingCompDump) {
            await Editor.Message.request("scene", "create-component", { uuid: nodeDump.uuid.value, component: scriptName });
            autoBindingCompIndex = nodeDump.__comps__.length;
        }
        else {
            // @ts-ignore
            let compUuid = autoBindingCompDump.value[`uuid`][`value`];
            await Editor.Message.request("scene", "reset-component", { uuid: compUuid });
        }
        let bindingProperties = await getBindingProperties();
        // console.log(`doAutoBinding bindingProperties`, bindingProperties);
        // async await 在forEach中使用无效
        for (let index = 0; index < bindingProperties.length; index++) {
            const element = bindingProperties[index];
            await Editor.Message.request("scene", "set-property", {
                uuid: nodeDump.uuid.value,
                path: `__comps__.${autoBindingCompIndex}.${element.name}`,
                dump: {
                    type: element.type,
                    value: {
                        uuid: element.uuid,
                    }
                }
            });
        }
        if (Editor.EditMode.getMode() == "prefab") {
            await Editor.Message.request('scene', 'save-scene');
            await Editor.Message.request('scene', 'soft-reload');
        }
        await Editor.Message.request('scene', 'apply-prefab', nodeDump.uuid.value);
        console.log(`doAutoBinding success`);
    }
})(AutoBindingGenerator || (exports.AutoBindingGenerator = AutoBindingGenerator = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDOzs7QUFJYixNQUFNLElBQUksR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFN0IsU0FBZ0IsSUFBSSxLQUFJLENBQUM7QUFBekIsb0JBQXlCO0FBQ3pCLFNBQWdCLE1BQU0sS0FBSSxDQUFDO0FBQTNCLHdCQUEyQjtBQUVkLFFBQUEsT0FBTyxHQUFHO0lBQ25CLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxlQUFvQjtRQUN4QyxJQUFJLGVBQWUsQ0FBQyxVQUFVLElBQUksRUFBRSxFQUFFO1lBQ2xDLElBQUksU0FBUyxHQUFHLE1BQU0sTUFBTSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLGVBQWUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUN6RyxJQUFJLFNBQVMsRUFBRTtnQkFDWCxvQkFBb0IsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFDLFNBQVMsRUFBRSxlQUFlLEVBQUMsQ0FBQyxDQUFDO2FBQ3ZFO1NBQ0o7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVE7UUFDVixvQkFBb0IsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDeEMsQ0FBQztDQUNKLENBQUM7QUFHRixJQUFjLG9CQUFvQixDQTRWakM7QUE1VkQsV0FBYyxvQkFBb0I7SUFDOUIsSUFBSSxhQUF1QyxDQUFDO0lBQzVDLElBQUksUUFBZSxDQUFDO0lBQ3BCLElBQUksZUFBb0IsQ0FBQztJQUV6QixTQUFTLG1CQUFtQixDQUFDLEdBQWM7UUFDdkMsSUFBSSxHQUFHLENBQUMsSUFBSSxJQUFJLFdBQVcsRUFBRTtZQUN6QixJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDdkMsZUFBZTtnQkFDZixPQUFPLEtB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QUMsSUFBSTtxQkFDckI7aUJBQ0o7YUFDSixDQUFDLENBQUM7U0FDTjtRQUVELElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsSUFBSSxRQUFRLEVBQUU7WUFDdkMsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7WUFDcEQsTUFBTSxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLENBQUM7U0FDeEQ7UUFFRCxNQUFNLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUUzRSxPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDekMsQ0FBQztBQUNMLENBQUMsRUE1VmEsb0JBQW9CLG9DQUFwQixvQkFBb0IsUUE0VmpDIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xyXG5cclxuaW1wb3J0IHsgQXNzZXRJbmZvIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9hc3NldC1kYi9AdHlwZXMvcHVibGljXCI7XHJcbmltcG9ydCB7IElOb2RlIH0gZnJvbSBcIkBjb2Nvcy9jcmVhdG9yLXR5cGVzL2VkaXRvci9wYWNrYWdlcy9zY2VuZS9AdHlwZXMvcHVibGljXCI7XHJcbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbG9hZCgpIHt9XHJcbmV4cG9ydCBmdW5jdGlvbiB1bmxvYWQoKSB7fVxyXG5cclxuZXhwb3J0IGNvbnN0IG1ldGhvZHMgPSB7XHJcbiAgICBhc3luYyB1cGRhdGVBdXRvQmluZGluZyhhdXRvQmluZGluZ0RhdGE6IGFueSkge1xyXG4gICAgICAgIGlmIChhdXRvQmluZGluZ0RhdGEucHJlZmFiVXVpZCAhPSBgYCkge1xyXG4gICAgICAgICAgICBsZXQgYXNzZXRJbmZvID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktYXNzZXQtaW5mbycsIGF1dG9CaW5kaW5nRGF0YS5wcmVmYWJVdWlkKTtcclxuICAgICAgICAgICAgaWYgKGFzc2V0SW5mbykge1xyXG4gICAgICAgICAgICAgICAgQXV0b0JpbmRpbmdHZW5lcmF0b3IuYWRkR2VuZXJhdGVRdWV1ZSh7YXNzZXRJbmZvLCBhdXRvQmluZGluZ0RhdGF9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgZ2VuZXJhdGUoKSB7XHJcbiAgICAgICAgQXV0b0JpbmRpbmdHZW5lcmF0b3IuZ2VuZXJhdGUodHJ1ZSk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5cclxuZXhwb3J0IG1vZHVsZSBBdXRvQmluZGluZ0dlbmVyYXRvciB7XHJcbiAgICBsZXQgdHlwZUltcG9ydE1hcDogTWFwPHN0cmluZywgU2V0PHN0cmluZz4+O1xyXG4gICAgbGV0IG5vZGVEdW1wOiBJTm9kZTtcclxuICAgIGxldCBhdXRvQmluZGluZ0RhdGE6IGFueTtcclxuXHJcbiAgICBmdW5jdGlvbiBpc0F1dG9CaW5kaW5nUHJlZmFiKG1zZzogQXNzZXRJbmZvKSB7XHJcbiAgICAgICAgaWYgKG1zZy50eXBlID09IGBjYy5QcmVmYWJgKSB7XHJcbiAgICAgICAgICAgIGlmIChtc2cudXJsLmluZGV4T2YoYGRiOi8vaW50ZXJuYWxgKSA9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAvLyDns7vnu5/kuItwcmVmYWLkuI3mk43kvZxcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGlzQXV0b0JpbmRpbmdTY3JpcHQobXNnOiBBc3NldEluZm8pIHtcclxuICAgICAgICBpZiAobXNnLnVybC5pbmRleE9mKGBkYjovL2Fzc2V0cy9zY3JpcHQvZ2FtZS9hdXRvYmluZGluZ2ApID09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIHNhdmVGaWxlKHVybDogc3RyaW5nLCBjb250ZW50U3RyOiBzdHJpbmcpIHtcclxuICAgICAgICAvLyBUT0RPIFByZWZhYuWIoOmZpOWQju+8jOWvueW6lOeahOe7keWumuS5n+mcgOimgeWIoOmZpO+8jFByZWZhYuenu+WKqOaWh+S7tuWkueS9jee9ru+8jOe7keWumuS5n+mcgOimgeenu+WKqFxyXG4gICAgICAgIGxldCByZXN1bHQgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFwiYXNzZXQtZGJcIiwgXCJjcmVhdGUtYXNzZXRcIiwgdXJsLCBjb250ZW50U3RyLCB7b3ZlcndyaXRlOiB0cnVlfSk7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBnZXRUeXBlTmFtZSh0eXBlOiBzdHJpbmcpIHtcclxuICAgICAgICBsZXQgYXJyID0gdHlwZS5zcGxpdChgLmApO1xyXG4gICAgICAgIHJldHVybiBhcnIubGVuZ3RoID4gMSA/IGFyclsxXSA6IGFyclswXTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0eXBlcFJyZWZpeENvbmZpZzoge1trZXk6IHN0cmluZ106IHN0cmluZ30gPSB7XHJcbiAgICAgICAgVUlUcmFuc2Zvcm06IGB1dGAsXHJcbiAgICAgICAgU3ByaXRlOiBgc3B0YCxcclxuICAgICAgICBMYWJlbDogYGxibGAsXHJcbiAgICAgICAgQ0xhYmVsOiBgbGJsYCxcclxuICAgICAgICBCdXR0b246IGBidG5gLFxyXG4gICAgICAgIENCdXR0b246IGBidG5gLFxyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gZ2V0VHlwZVByZWZpeCh0eXBlOiBzdHJpbmcpIHtcclxuICAgICAgICBsZXQgdHlwZU5hbWUgPSBnZXRUeXBlTmFtZSh0eXBlKTtcclxuICAgICAgICBpZiAodHlwZU5hbWUuaW5kZXhPZignQXV0b0JpbmRpbmcnKSAhPSAtMSkge1xyXG4gICAgICAgICAgICByZXR1cm4gYGJpbmRpbmdgO1xyXG4gICAgICAgIH1cclxuICAgICAgICBsZXQgdHlwZVByZWZpeCA9IHR5cGVwUnJlZml4Q29uZmlnW3R5cGVOYW1lXTtcclxuICAgICAgICByZXR1cm4gdHlwZVByZWZpeCB8fCB0eXBlTmFtZS50cmltKCkucmVwbGFjZSgvXlxcUy8sIChzdHIpID0+IHN0ci50b0xvd2VyQ2FzZSgpKTtcclxuICAgIH1cclxuXHJcbiAgICAvKiog5re75Yqg5a+85YWl5qih5Z2X5L+h5oGvICovXHJcbiAgICBmdW5jdGlvbiBhZGRUeXBlSW1wb3J0KHR5cGU6IHN0cmluZywgYXV0b0JpbmRpbmdVcmw6IHN0cmluZywgY29tcFVybDogc3RyaW5nIHwgbnVsbCA9IG51bGwpIHtcclxuICAgICAgICBsZXQgdHlwZU5hbWUgPSBnZXRUeXBlTmFtZSh0eXBlKTtcclxuICAgICAgICBsZXQgaW1wb3J0UGF0aCA9IGBgO1xyXG4gICAgICAgIHN3aXRjaCAodHlwZU5hbWUpIHtcclxuICAgICAgICAgICAgY2FzZSBgR2FtZUNvbXBvbmVudGA6XHJcbiAgICAgICAgICAgICAgICBpbXBvcnRQYXRoID0gYEBvb3BzL2Fzc2V0cy9tb2R1bGUvY29tbW9uL0dhbWVDb21wb25lbnRgO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGNhc2UgYENCdXR0b25gOlxyXG4gICAgICAgICAgICBjYXNlIGBDTGFiZWxgOlxyXG4gICAgICAgICAgICBjYXNlIGBDTnVtYmVyU2VsZWN0b3JgOlxyXG4gICAgICAgICAgICBjYXNlIGBDVG9nZ2xlYDpcclxuICAgICAgICAgICAgY2FzZSBgQ1RvZ2dsZUNvbnRhaW5lcmA6XHJcbiAgICAgICAgICAgICAgICBpbXBvcnRQYXRoID0gYEBvb3BzL2Fzc2V0cy9jb3JlL2d1aS9jY29tcC8ke3R5cGVOYW1lfWA7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBgQ1BpY2tlcmA6XHJcbiAgICAgICAgICAgICAgICBpbXBvcnRQYXRoID0gYEBvb3BzL2Fzc2V0cy9jb3JlL2d1aS9jY29tcC9jcGlja2VyLyR7dHlwZU5hbWV9YDtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlIGBDTGlzdGA6XHJcbiAgICAgICAgICAgICAgICBpbXBvcnRQYXRoID0gYEBvb3BzL2Fzc2V0cy9jb3JlL2d1aS9jY29tcC9jbGlzdC8ke3R5cGVOYW1lfWA7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSBgQXV0b0JpbmRpbmdCYXNlYDpcclxuICAgICAgICAgICAgICAgIGxldCBhdXRvQmluZGluZ0Jhc2VVcmwgPSAnZGI6Ly9hc3NldHMvc2NyaXB0L2dhbWUvYXV0b2JpbmRpbmcvQXV0b0JpbmRpbmdCYXNlLnRzJztcclxuICAgICAgICAgICAgICAgIGxldCByZWxhdGl2ZVBhdGggPSBwYXRoLnJlbGF0aXZlKGF1dG9CaW5kaW5nVXJsLCBhdXRvQmluZGluZ0Jhc2VVcmwpO1xyXG4gICAgICAgICAgICAgICAgcmVsYXRpdmVQYXRoID0gcmVsYXRpdmVQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcclxuICAgICAgICAgICAgICAgIHJlbGF0aXZlUGF0aCA9IHJlbGF0aXZlUGF0aC5yZXBsYWNlKCcuLi8nLCAnLi8nKTtcclxuICAgICAgICAgICAgICAgIHJlbGF0aXZlUGF0aCA9IHJlbGF0aXZlUGF0aC5yZXBsYWNlKCcudHMnLCAnJyk7XHJcbiAgICAgICAgICAgICAgICBpbXBvcnRQYXRoID0gcmVsYXRpdmVQYXRoO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZU5hbWUuaW5kZXhPZihcIkF1dG9CaW5kaW5nXCIpICE9IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBVcmwpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUoYXV0b0JpbmRpbmdVcmwsIGNvbXBVcmwpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZVBhdGggPSByZWxhdGl2ZVBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZVBhdGggPSByZWxhdGl2ZVBhdGgucmVwbGFjZSgnLi4vJywgJy4vJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlUGF0aCA9IHJlbGF0aXZlUGF0aC5yZXBsYWNlKCcudHMnLCAnJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGltcG9ydFBhdGggPSByZWxhdGl2ZVBhdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRPRE8g5ZCO5pyf5aaC5p6c5ZCM5ZCN5LqG77yMdHlwZU5hbWUg6ZyA6KaB5pS55oiQ5a+55bqU55qEIHR5cGVOYW1lIGFzIHh4eFxyXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGltcG9ydFBhdGggPSBgLi8ke3R5cGVOYW1lfWBcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGltcG9ydFBhdGggPSBgY2NgO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCB0eXBlU2V0ID0gdHlwZUltcG9ydE1hcC5nZXQoaW1wb3J0UGF0aCk7XHJcbiAgICAgICAgaWYgKCF0eXBlU2V0KSB7XHJcbiAgICAgICAgICAgIHR5cGVTZXQgPSBuZXcgU2V0KCk7XHJcbiAgICAgICAgICAgIHR5cGVJbXBvcnRNYXAuc2V0KGltcG9ydFBhdGgsIHR5cGVTZXQpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0eXBlU2V0LmFkZCh0eXBlTmFtZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqIOiOt+WPluWxnuaAp+WQjSAqL1xyXG4gICAgZnVuY3Rpb24gZ2V0QmluaW5nUHJvcGVydHlOYW1lKHR5cGU6IHN0cmluZywgbmFtZTogc3RyaW5nLCBuYW1lTWFwOiBNYXA8c3RyaW5nLCBudW1iZXI+KSB7XHJcbiAgICAgICAgbGV0IHR5cGVOYW1lID0gZ2V0VHlwZVByZWZpeCh0eXBlKTtcclxuXHJcbiAgICAgICAgbmFtZSA9IG5hbWUudHJpbSgpLnJlcGxhY2UoL15cXFMvLCAoc3RyKSA9PiBzdHIudG9VcHBlckNhc2UoKSk7XHJcbiAgICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvXy9nLCAoc3RyKSA9PiAnICcpO1xyXG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLy0vZywgKHN0cikgPT4gJycpO1xyXG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLyBcXFMvZywgKHN0cikgPT4gYCAke3N0ci50b1VwcGVyQ2FzZSgpfWApO1xyXG4gICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLyhbYS16XSkoW0EtWl0pKFswLTldKS9nLCAnJDEkMiQzJyk7XHJcblxyXG4gICAgICAgIC8vIOWOu+mZpOWOn+iKgueCueS4iueahOe7hOS7tuWJjee8gFxyXG4gICAgICAgIGZvciAoY29uc3QgZWxlbWVudCBpbiB0eXBlcFJyZWZpeENvbmZpZykge1xyXG4gICAgICAgICAgICBpZiAobmFtZS50b0xvd2VyQ2FzZSgpICE9IGVsZW1lbnQudG9Mb3dlckNhc2UoKSAmJiBuYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aChlbGVtZW50LnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcmVnID0gbmV3IFJlZ0V4cChgJHtlbGVtZW50fWAsXCJpXCIpO1xyXG4gICAgICAgICAgICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZShyZWcsIHN0ciA9PiAnJyk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgfSBlbHNlIGlmIChuYW1lLnRvTG93ZXJDYXNlKCkgIT0gdHlwZXBScmVmaXhDb25maWdbZWxlbWVudF0udG9Mb3dlckNhc2UoKSAmJiBuYW1lLnRvTG93ZXJDYXNlKCkuc3RhcnRzV2l0aCh0eXBlcFJyZWZpeENvbmZpZ1tlbGVtZW50XS50b0xvd2VyQ2FzZSgpKSkge1xyXG4gICAgICAgICAgICAgICAgbGV0IHJlZyA9IG5ldyBSZWdFeHAoYCR7dHlwZXBScmVmaXhDb25maWdbZWxlbWVudF19YCxcImlcIik7XHJcbiAgICAgICAgICAgICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKHJlZywgc3RyID0+ICcnKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKG5hbWUudG9Mb3dlckNhc2UoKSAhPSB0eXBlTmFtZS50b0xvd2VyQ2FzZSgpICYmIG5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHR5cGVOYW1lLnRvTG93ZXJDYXNlKCkpKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgcmVnID0gbmV3IFJlZ0V4cChgJHt0eXBlTmFtZX1gLFwiaVwiKTtcclxuICAgICAgICAgICAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UocmVnLCBzdHIgPT4gJycpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIG5hbWUgPSBuYW1lLnRyaW0oKTtcclxuICAgICAgICBuYW1lID0gYCR7dHlwZU5hbWV9JHtuYW1lfWA7XHJcblxyXG4gICAgICAgIC8vIOmHjeWQjeWkhOeQhlxyXG4gICAgICAgIGxldCBuYW1lQ250ID0gbmFtZU1hcC5nZXQobmFtZSk7XHJcbiAgICAgICAgaWYgKCFuYW1lQ250KSB7XHJcbiAgICAgICAgICAgIG5hbWVNYXAuc2V0KG5hbWUsIDEpO1xyXG4gICAgICAgICAgICByZXR1cm4gbmFtZVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIG5hbWVNYXAuc2V0KG5hbWUsIG5hbWVDbnQgKyAxKTtcclxuICAgICAgICAgICAgbmFtZSA9IGAke25hbWV9JHtuYW1lQ250fWBcclxuICAgICAgICAgICAgbmFtZU1hcC5zZXQobmFtZSwgMSk7XHJcbiAgICAgICAgfVxyXG4gICAgXHJcbiAgICAgICAgcmV0dXJuIG5hbWU7XHJcbiAgICB9XHJcblxyXG4gICAgaW50ZXJmYWNlIElCaW5kaW5nUHJvcGVydGllcyB7XHJcbiAgICAgICAgdHlwZTogc3RyaW5nLFxyXG4gICAgICAgIG5hbWU6IHN0cmluZyxcclxuICAgICAgICB1dWlkOiBzdHJpbmcsXHJcbiAgICAgICAgdXJsOiBzdHJpbmcgfCBudWxsLFxyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gZ2V0QmluZGluZ1Byb3BlcnRpZXMoKTogUHJvbWlzZTxJQmluZGluZ1Byb3BlcnRpZXNbXT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxJQmluZGluZ1Byb3BlcnRpZXNbXT4oYXN5bmMgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgICAgICBsZXQgbm9kZU5hbWUgPSBub2RlRHVtcC5uYW1lLnZhbHVlIGFzIHN0cmluZztcclxuICAgICAgICAgICAgbGV0IG5vZGVOYW1lQXV0b0JpbmRpbmcgPSBgJHtub2RlTmFtZX1BdXRvQmluZGluZ2A7XHJcblxyXG4gICAgICAgICAgICBsZXQgbm9kZVRyZWVEdW1wOiBhbnkgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFwic2NlbmVcIiwgXCJxdWVyeS1ub2RlLXRyZWVcIiwgbm9kZUR1bXAudXVpZC52YWx1ZSBhcyBzdHJpbmcpO1xyXG4gICAgICAgICAgICBsZXQgYmluZGluZ1Byb3BlcnRpZXM6IElCaW5kaW5nUHJvcGVydGllc1tdID0gW107XHJcblxyXG4gICAgICAgICAgICBsZXQgbmFtZU1hcDogTWFwPHN0cmluZywgbnVtYmVyPiA9IG5ldyBNYXAoKTtcclxuICAgICAgICAgICAgbGV0IHJlY3Vyc2lvbiA9IGFzeW5jIChuZHA6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IG5kcC5jb21wb25lbnRzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVsZW1lbnQgPSBuZHAuY29tcG9uZW50c1tpbmRleF07XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGF1dG9CaW5kaW5nRGF0YS5hdXRvQmluZGluZ01hcFtlbGVtZW50LnZhbHVlXSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdHlwZSA9IGVsZW1lbnQudHlwZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHV1aWQgPSBlbGVtZW50LnZhbHVlO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHVybCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlLmluZGV4T2YoJ0F1dG9CaW5kaW5nJykgIT0gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBjb21wID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcInNjZW5lXCIsIFwicXVlcnktY29tcG9uZW50XCIsIHV1aWQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXJsID0gYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnYXNzZXQtZGInLCAncXVlcnktdXJsJywgRWRpdG9yLlV0aWxzLlVVSUQuZGVjb21wcmVzc1VVSUQoY29tcC5jaWQgYXMgc3RyaW5nKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5hbWUgPSBnZXRCaW5pbmdQcm9wZXJ0eU5hbWUodHlwZSwgbmRwLm5hbWUsIG5hbWVNYXApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgY29tcFR5cGUgPSBnZXRUeXBlTmFtZShlbGVtZW50LnR5cGUgYXMgc3RyaW5nKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNvbXBUeXBlICE9IG5vZGVOYW1lQXV0b0JpbmRpbmcgJiYgY29tcFR5cGUgIT0gYE1pc3NpbmdTY3JpcHRgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBiaW5kaW5nUHJvcGVydGllcy5wdXNoKHt0eXBlOiB0eXBlLCBuYW1lOiBuYW1lLCB1dWlkOiB1dWlkLCB1cmw6IHVybH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBuZHAuY2hpbGRyZW4ubGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWxlbWVudCA9IG5kcC5jaGlsZHJlbltpbmRleF07XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVjdXJzaW9uKGVsZW1lbnQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBhd2FpdCByZWN1cnNpb24obm9kZVRyZWVEdW1wKTtcclxuICAgICAgICAgICAgcmVzb2x2ZShiaW5kaW5nUHJvcGVydGllcyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgaW50ZXJmYWNlIElHZW5lcmF0ZVF1ZXVlIHtcclxuICAgICAgICBhc3NldEluZm86IEFzc2V0SW5mbyxcclxuICAgICAgICBhdXRvQmluZGluZ0RhdGE6IHtwcmVmYWJVdWlkOiBzdHJpbmcsIGF1dG9CaW5kaW5nTWFwOiB7W2tleTogc3RyaW5nXTogYm9vbGVhbn19LFxyXG4gICAgfVxyXG4gICAgbGV0IGdlbmVyYXRlUXVldWU6IElHZW5lcmF0ZVF1ZXVlW10gPSBbXTtcclxuICAgIGV4cG9ydCBmdW5jdGlvbiBhZGRHZW5lcmF0ZVF1ZXVlKHF1ZXVlRGF0YTogSUdlbmVyYXRlUXVldWUpIHtcclxuICAgICAgICBnZW5lcmF0ZVF1ZXVlLnB1c2gocXVldWVEYXRhKTtcclxuICAgICAgICBnZW5lcmF0ZShmYWxzZSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBpc0dlbmVyYXRlID0gZmFsc2VcclxuICAgIGV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZShiUXVldWU6IGJvb2xlYW4pIHtcclxuICAgICAgICBpZiAoIWlzR2VuZXJhdGUgfHwgYlF1ZXVlKSB7XHJcbiAgICAgICAgICAgIGxldCBxdWV1ZURhdGEgPSBnZW5lcmF0ZVF1ZXVlLnNoaWZ0KCk7XHJcbiAgICAgICAgICAgIGlmIChxdWV1ZURhdGEpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBxdWV1ZURhdGFgLCBxdWV1ZURhdGEpO1xyXG4gICAgICAgICAgICAgICAgaXNHZW5lcmF0ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNBdXRvQmluZGluZ1ByZWZhYihxdWV1ZURhdGEuYXNzZXRJbmZvKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF1dG9CaW5kaW5nRGF0YSA9IHF1ZXVlRGF0YS5hdXRvQmluZGluZ0RhdGE7XHJcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgZG9BdXRvRmlsZShxdWV1ZURhdGEuYXNzZXRJbmZvKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzQXV0b0JpbmRpbmdTY3JpcHQocXVldWVEYXRhLmFzc2V0SW5mbykpIHtcclxuICAgICAgICAgICAgICAgICAgICBhdXRvQmluZGluZ0RhdGEgPSBxdWV1ZURhdGEuYXV0b0JpbmRpbmdEYXRhO1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGRvQXV0b0JpbmRpbmcocXVldWVEYXRhLmFzc2V0SW5mbyk7XHJcbiAgICAgICAgICAgICAgICAgICAgZ2VuZXJhdGUodHJ1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaXNHZW5lcmF0ZSA9IGZhbHNlXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGZ1bmN0aW9uIGRvQXV0b0ZpbGUobXNnOiBBc3NldEluZm8pIHtcclxuICAgICAgICAvLyDmoLnmja7lj5jljJbnmoTotYTmupB1dWlk77yM5om+5Yiw6IqC54K5dXVpZFxyXG4gICAgICAgIGxldCBub2RldXVpZHMgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFwic2NlbmVcIiwgXCJxdWVyeS1ub2Rlcy1ieS1hc3NldC11dWlkXCIsIG1zZy51dWlkKTtcclxuICAgICAgICBpZiAobm9kZXV1aWRzLmxlbmd0aCA+IDEpIHtcclxuICAgICAgICAgICAgLy8g5b2T5Zy65pmv5Lit5ouW5Ye65p2l5aSa5LiqUHJlZmFi5a+56LGh5pe2XHJcbiAgICAgICAgICAgIEVkaXRvci5EaWFsb2cud2FybihcIuW9k+WJjeWcuuaZr+S4reacieWkmuS4quebuOWQjOeahFByZWZhYuWvueixoe+8jOaXoOazleeUn+aIkEF1dG9CaW5kaW5nXCIpO1xyXG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdzY2VuZScsICdzb2Z0LXJlbG9hZCcpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHR5cGVJbXBvcnRNYXAgPSBuZXcgTWFwKCk7XHJcbiAgICAgICAgbm9kZUR1bXAgPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFwic2NlbmVcIiwgXCJxdWVyeS1ub2RlXCIsIG5vZGV1dWlkc1swXSk7XHJcbiAgICAgICAgaWYgKCFub2RlRHVtcCkge1xyXG4gICAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZS5sb2coYGRvQXV0b0ZpbGUgc3RhcnRgKTtcclxuXHJcbiAgICAgICAgbGV0IG5vZGVOYW1lID0gbm9kZUR1bXAubmFtZS52YWx1ZSBhcyBzdHJpbmc7XHJcbiAgICAgICAgbGV0IG5vZGVOYW1lQXV0b0JpbmRpbmcgPSBgJHtub2RlTmFtZX1BdXRvQmluZGluZ2A7XHJcblxyXG4gICAgICAgIGxldCBwcmVmYWJVcmwgPSBtc2cudXJsO1xyXG4gICAgICAgIGxldCBhdXRvQmluZGluZ1VybCA9IHByZWZhYlVybC5yZXBsYWNlKFwiZGI6Ly9hc3NldHMvYnVuZGxlL1wiLCBcImRiOi8vYXNzZXRzL3NjcmlwdC9nYW1lL2F1dG9iaW5kaW5nL1wiKTtcclxuICAgICAgICBhdXRvQmluZGluZ1VybCA9IGF1dG9CaW5kaW5nVXJsLnJlcGxhY2UobXNnLm5hbWUsIGAke25vZGVOYW1lQXV0b0JpbmRpbmd9LnRzYCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgYWRkVHlwZUltcG9ydChgQXV0b0JpbmRpbmdCYXNlYCwgYXV0b0JpbmRpbmdVcmwpO1xyXG4gICAgICAgIGFkZFR5cGVJbXBvcnQoYF9kZWNvcmF0b3JgLCBhdXRvQmluZGluZ1VybCk7XHJcbiAgICAgICAgYWRkVHlwZUltcG9ydChgQ29tcG9uZW50YCwgYXV0b0JpbmRpbmdVcmwpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCBhdXRvQmluZGluZyA9IFxyXG5gXHJcbmNvbnN0IHsgY2NjbGFzcywgcHJvcGVydHkgfSA9IF9kZWNvcmF0b3I7XHJcblxyXG5AY2NjbGFzcygnJHtub2RlTmFtZUF1dG9CaW5kaW5nfScpXHJcbmV4cG9ydCBjbGFzcyAke25vZGVOYW1lQXV0b0JpbmRpbmd9IGV4dGVuZHMgQXV0b0JpbmRpbmdCYXNlIHtcclxuXHJcbiR7XHJcbiAgICBhd2FpdCAoYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIGxldCBiaW5kaW5nU3RyQXJyOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgIGxldCBiaW5kaW5nUHJvcGVydGllczogSUJpbmRpbmdQcm9wZXJ0aWVzW10gPSBhd2FpdCBnZXRCaW5kaW5nUHJvcGVydGllcygpO1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBkb0F1dG9GaWxlIGJpbmRpbmdQcm9wZXJ0aWVzYCwgYmluZGluZ1Byb3BlcnRpZXMpO1xyXG4gICAgICAgIGJpbmRpbmdQcm9wZXJ0aWVzLmZvckVhY2goZWxlbWVudCA9PiB7XHJcbiAgICAgICAgICAgIGxldCBjb21wVHlwZSA9IGdldFR5cGVOYW1lKGVsZW1lbnQudHlwZSBhcyBzdHJpbmcpO1xyXG4gICAgICAgICAgICBhZGRUeXBlSW1wb3J0KGNvbXBUeXBlLCBhdXRvQmluZGluZ1VybCwgZWxlbWVudC51cmwpO1xyXG4gICAgICAgICAgICBsZXQgYmluZGluZ1N0ciA9IGBcXHRAcHJvcGVydHkoeyB0eXBlOiR7Y29tcFR5cGV9LCByZWFkb25seTogdHJ1ZSB9KVxcblxcdCR7ZWxlbWVudC5uYW1lfTogJHtjb21wVHlwZX0gPSBudWxsITtcXG5gO1xyXG4gICAgICAgICAgICBiaW5kaW5nU3RyQXJyLnB1c2goYmluZGluZ1N0cik7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgcmV0dXJuIGJpbmRpbmdTdHJBcnIuam9pbihgXFxuYCk7XHJcbiAgICB9KSgpXHJcbn1cclxufVxyXG5gICAgXHJcbiAgICAgICAgbGV0IGltcG9ydFN0ckFycjogc3RyaW5nW10gPSBbXTsgICAgICAgIFxyXG4gICAgICAgIGZvciAoY29uc3QgW2ltcG9ydFBhdGgsIHR5cGVTZXRdIG9mIHR5cGVJbXBvcnRNYXApIHtcclxuICAgICAgICAgICAgbGV0IGltcG9ydFN0ciA9IGBpbXBvcnQgeyAke0FycmF5LmZyb20odHlwZVNldCkuam9pbihgLCBgKX0gfSBmcm9tICcke2ltcG9ydFBhdGh9J2A7XHJcbiAgICAgICAgICAgIGltcG9ydFN0ckFyci5wdXNoKGltcG9ydFN0cik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGxldCBmaWxlQ29udGVudCA9IGAke2ltcG9ydFN0ckFyci5qb2luKGBcXG5gKX1cXG4ke2F1dG9CaW5kaW5nfWA7XHJcblxyXG4gICAgICAgIFxyXG4gICAgICAgIGxldCByZXN1bHQgPSBhd2FpdCBzYXZlRmlsZShhdXRvQmluZGluZ1VybCwgZmlsZUNvbnRlbnQpO1xyXG4gICAgICAgIGlmIChyZXN1bHQpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYGRvQXV0b0ZpbGUgc3VjY2Vzc2ApO1xyXG4gICAgICAgICAgICAvLyDmt7vliqDmiafooYzpmJ/liJfvvIznrYnmlLbliLDnvJbor5HlrozmiJDmtojmga/lkI7vvIzmiafooYznu5HlrppcclxuICAgICAgICAgICAgYWRkR2VuZXJhdGVRdWV1ZSh7YXNzZXRJbmZvOiByZXN1bHQsIGF1dG9CaW5kaW5nRGF0YX0pXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYGRvQXV0b0ZpbGUgZmFpbGApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBkb0F1dG9CaW5kaW5nKG1zZzogQXNzZXRJbmZvKSB7XHJcbiAgICAgICAgbGV0IG5vZGVOYW1lID0gbm9kZUR1bXAubmFtZS52YWx1ZSBhcyBzdHJpbmc7XHJcbiAgICAgICAgbGV0IG5vZGVOYW1lQXV0b0JpbmRpbmcgPSBgJHtub2RlTmFtZX1BdXRvQmluZGluZ2A7XHJcbiAgICAgICAgbGV0IHNjcmlwdE5hbWUgPSBtc2cubmFtZS5zcGxpdChgLmApWzBdO1xyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBkb0F1dG9CaW5kaW5nIG5vZGVOYW1lQXV0b0JpbmRpbmcgPSAke25vZGVOYW1lQXV0b0JpbmRpbmd9IHNjcmlwdE5hbWUgPSAke3NjcmlwdE5hbWV9YCk7XHJcbiAgICAgICAgaWYgKG5vZGVOYW1lQXV0b0JpbmRpbmcgIT0gc2NyaXB0TmFtZSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnNvbGUubG9nKGBkb0F1dG9CaW5kaW5nIHN0YXJ0YCk7XHJcbiAgICAgICAgbGV0IGF1dG9CaW5kaW5nQ29tcER1bXA7XHJcbiAgICAgICAgbGV0IGF1dG9CaW5kaW5nQ29tcEluZGV4OiBudW1iZXI7XHJcbiAgICAgICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IG5vZGVEdW1wLl9fY29tcHNfXy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgY29uc3QgZWxlbWVudCA9IG5vZGVEdW1wLl9fY29tcHNfX1tpbmRleF07XHJcbiAgICAgICAgICAgIGxldCBjb21wVHlwZSA9IGdldFR5cGVOYW1lKGVsZW1lbnQudHlwZSBhcyBzdHJpbmcpO1xyXG4gICAgICAgICAgICBpZiAobm9kZU5hbWVBdXRvQmluZGluZyA9PSBjb21wVHlwZSkge1xyXG4gICAgICAgICAgICAgICAgYXV0b0JpbmRpbmdDb21wRHVtcCA9IGVsZW1lbnQ7XHJcbiAgICAgICAgICAgICAgICBhdXRvQmluZGluZ0NvbXBJbmRleCA9IGluZGV4O1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghYXV0b0JpbmRpbmdDb21wRHVtcCkge1xyXG4gICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KFwic2NlbmVcIiwgXCJjcmVhdGUtY29tcG9uZW50XCIsIHt1dWlkOiBub2RlRHVtcC51dWlkLnZhbHVlIGFzIHN0cmluZywgY29tcG9uZW50OiBzY3JpcHROYW1lfSk7XHJcbiAgICAgICAgICAgIGF1dG9CaW5kaW5nQ29tcEluZGV4ID0gbm9kZUR1bXAuX19jb21wc19fLmxlbmd0aDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgICAgIGxldCBjb21wVXVpZCA9IGF1dG9CaW5kaW5nQ29tcER1bXAudmFsdWVbYHV1aWRgXVtgdmFsdWVgXTtcclxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcInNjZW5lXCIsIFwicmVzZXQtY29tcG9uZW50XCIsIHt1dWlkOiBjb21wVXVpZH0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IGJpbmRpbmdQcm9wZXJ0aWVzOiBJQmluZGluZ1Byb3BlcnRpZXNbXSA9IGF3YWl0IGdldEJpbmRpbmdQcm9wZXJ0aWVzKCk7XHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coYGRvQXV0b0JpbmRpbmcgYmluZGluZ1Byb3BlcnRpZXNgLCBiaW5kaW5nUHJvcGVydGllcyk7XHJcbiAgICAgICAgLy8gYXN5bmMgYXdhaXQg5ZyoZm9yRWFjaOS4reS9v+eUqOaXoOaViFxyXG4gICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBiaW5kaW5nUHJvcGVydGllcy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgY29uc3QgZWxlbWVudCA9IGJpbmRpbmdQcm9wZXJ0aWVzW2luZGV4XTtcclxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdChcInNjZW5lXCIsIFwic2V0LXByb3BlcnR5XCIse1xyXG4gICAgICAgICAgICAgICAgdXVpZDogbm9kZUR1bXAudXVpZC52YWx1ZSBhcyBzdHJpbmcsXHJcbiAgICAgICAgICAgICAgICBwYXRoOmBfX2NvbXBzX18uJHthdXRvQmluZGluZ0NvbXBJbmRleCF9LiR7ZWxlbWVudC5uYW1lfWAsXHJcbiAgICAgICAgICAgICAgICBkdW1wOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogZWxlbWVudC50eXBlLFxyXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV1aWQ6IGVsZW1lbnQudXVpZCxcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBpZiAoRWRpdG9yLkVkaXRNb2RlLmdldE1vZGUoKSA9PSBcInByZWZhYlwiKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ3NhdmUtc2NlbmUnKTtcclxuICAgICAgICAgICAgYXdhaXQgRWRpdG9yLk1lc3NhZ2UucmVxdWVzdCgnc2NlbmUnLCAnc29mdC1yZWxvYWQnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IEVkaXRvci5NZXNzYWdlLnJlcXVlc3QoJ3NjZW5lJywgJ2FwcGx5LXByZWZhYicsIG5vZGVEdW1wLnV1aWQudmFsdWUpO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhgZG9BdXRvQmluZGluZyBzdWNjZXNzYCk7XHJcbiAgICB9XHJcbn0iXX0=