'use strict';

import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { INode } from "@cocos/creator-types/editor/packages/scene/@types/public";
const path = require('path');

export function load() {}
export function unload() {}

export const methods = {
    async updateAutoBinding(autoBindingData: any) {
        if (autoBindingData.prefabUuid != ``) {
            let assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', autoBindingData.prefabUuid);
            if (assetInfo) {
                AutoBindingGenerator.addGenerateQueue({assetInfo, autoBindingData});
            }
        }
    },

    async generate() {
        AutoBindingGenerator.generate(true);
    }
};


export module AutoBindingGenerator {
    let typeImportMap: Map<string, Set<string>>;
    let nodeDump: INode;
    let autoBindingData: any;

    function isAutoBindingPrefab(msg: AssetInfo) {
        if (msg.type == `cc.Prefab`) {
            if (msg.url.indexOf(`db://internal`) == 0) {
                // 系统下prefab不操作
                return false;
            }
            return true;
        }
        return false;
    }

    function isAutoBindingScript(msg: AssetInfo) {
        if (msg.url.indexOf(`db://assets/script/game/autobinding`) == 0) {
            return true;
        }
        return false
    }

    async function saveFile(url: string, contentStr: string) {
        // TODO Prefab删除后，对应的绑定也需要删除，Prefab移动文件夹位置，绑定也需要移动
        let result = await Editor.Message.request("asset-db", "create-asset", url, contentStr, {overwrite: true});
        return result;
    }

    function getTypeName(type: string) {
        let arr = type.split(`.`);
        return arr.length > 1 ? arr[1] : arr[0];
    }

    const typepRrefixConfig: {[key: string]: string} = {
        UITransform: `ut`,
        Sprite: `spt`,
        Label: `lbl`,
        CLabel: `lbl`,
        Button: `btn`,
        CButton: `btn`,
    }
    function getTypePrefix(type: string) {
        let typeName = getTypeName(type);
        if (typeName.indexOf('AutoBinding') != -1) {
            return `binding`;
        }
        let typePrefix = typepRrefixConfig[typeName];
        return typePrefix || typeName.trim().replace(/^\S/, (str) => str.toLowerCase());
    }

    /** 添加导入模块信息 */
    function addTypeImport(type: string, autoBindingUrl: string, compUrl: string | null = null) {
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
                    } else {
                        importPath = `./${typeName}`
                    }
                } else {
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
    function getBiningPropertyName(type: string, name: string, nameMap: Map<string, number>) {
        let typeName = getTypePrefix(type);

        name = name.trim().replace(/^\S/, (str) => str.toUpperCase());
        name = name.replace(/_/g, (str) => ' ');
        name = name.replace(/-/g, (str) => '');
        name = name.replace(/ \S/g, (str) => ` ${str.toUpperCase()}`);
        name = name.replace(/([a-z])([A-Z])([0-9])/g, '$1$2$3');

        // 去除原节点上的组件前缀
        for (const element in typepRrefixConfig) {
            if (name.toLowerCase() != element.toLowerCase() && name.toLowerCase().startsWith(element.toLowerCase())) {
                let reg = new RegExp(`${element}`,"i");
                name = name.replace(reg, str => '');
                break;
            } else if (name.toLowerCase() != typepRrefixConfig[element].toLowerCase() && name.toLowerCase().startsWith(typepRrefixConfig[element].toLowerCase())) {
                let reg = new RegExp(`${typepRrefixConfig[element]}`,"i");
                name = name.replace(reg, str => '');
                break;
            } else if (name.toLowerCase() != typeName.toLowerCase() && name.toLowerCase().startsWith(typeName.toLowerCase())) {
                let reg = new RegExp(`${typeName}`,"i");
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
            return name
        } else {
            nameMap.set(name, nameCnt + 1);
            name = `${name}${nameCnt}`
            nameMap.set(name, 1);
        }
    
        return name;
    }

    interface IBindingProperties {
        type: string,
        name: string,
        uuid: string,
        url: string | null,
    }
    function getBindingProperties(): Promise<IBindingProperties[]> {
        return new Promise<IBindingProperties[]>(async (resolve, reject) => {
            let nodeName = nodeDump.name.value as string;
            let nodeNameAutoBinding = `${nodeName}AutoBinding`;

            let nodeTreeDump: any = await Editor.Message.request("scene", "query-node-tree", nodeDump.uuid.value as string);
            let bindingProperties: IBindingProperties[] = [];

            let nameMap: Map<string, number> = new Map();
            let recursion = async (ndp: any) => {
                for (let index = 0; index < ndp.components.length; index++) {
                    const element = ndp.components[index];
                    if (autoBindingData.autoBindingMap[element.value]) {
                        let type = element.type;
                        let uuid = element.value;

                        let url = null;
                        if (type.indexOf('AutoBinding') != -1) {
                            let comp = await Editor.Message.request("scene", "query-component", uuid);
                            url = await Editor.Message.request('asset-db', 'query-url', Editor.Utils.UUID.decompressUUID(comp.cid as string));
                        }
                        let name = getBiningPropertyName(type, ndp.name, nameMap);
                        let compType = getTypeName(element.type as string);
                        if (compType != nodeNameAutoBinding && compType != `MissingScript`) {
                            bindingProperties.push({type: type, name: name, uuid: uuid, url: url});
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

    interface IGenerateQueue {
        assetInfo: AssetInfo,
        autoBindingData: {prefabUuid: string, autoBindingMap: {[key: string]: boolean}},
    }
    let generateQueue: IGenerateQueue[] = [];
    export function addGenerateQueue(queueData: IGenerateQueue) {
        generateQueue.push(queueData);
        generate(false);
    }
    
    let isGenerate = false
    export async function generate(bQueue: boolean) {
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
            isGenerate = false
        }
    }

    async function doAutoFile(msg: AssetInfo) {
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
            return
        }
        console.log(`doAutoFile start`);

        let nodeName = nodeDump.name.value as string;
        let nodeNameAutoBinding = `${nodeName}AutoBinding`;

        let prefabUrl = msg.url;
        let autoBindingUrl = prefabUrl.replace("db://assets/bundle/", "db://assets/script/game/autobinding/");
        autoBindingUrl = autoBindingUrl.replace(msg.name, `${nodeNameAutoBinding}.ts`);
        
        addTypeImport(`AutoBindingBase`, autoBindingUrl);
        addTypeImport(`_decorator`, autoBindingUrl);
        addTypeImport(`Component`, autoBindingUrl);
        
        let autoBinding = 
`
const { ccclass, property } = _decorator;

@ccclass('${nodeNameAutoBinding}')
export class ${nodeNameAutoBinding} extends AutoBindingBase {

${
    await (async () => {
        let bindingStrArr: string[] = [];
        let bindingProperties: IBindingProperties[] = await getBindingProperties();
        // console.log(`doAutoFile bindingProperties`, bindingProperties);
        bindingProperties.forEach(element => {
            let compType = getTypeName(element.type as string);
            addTypeImport(compType, autoBindingUrl, element.url);
            let bindingStr = `\t@property({ type:${compType}, readonly: true })\n\t${element.name}: ${compType} = null!;\n`;
            bindingStrArr.push(bindingStr);
        });
        return bindingStrArr.join(`\n`);
    })()
}
}
`   
        let importStrArr: string[] = [];        
        for (const [importPath, typeSet] of typeImportMap) {
            let importStr = `import { ${Array.from(typeSet).join(`, `)} } from '${importPath}'`;
            importStrArr.push(importStr);
        }
        let fileContent = `${importStrArr.join(`\n`)}\n${autoBinding}`;

        
        let result = await saveFile(autoBindingUrl, fileContent);
        if (result) {
            console.log(`doAutoFile success`);
            // 添加执行队列，等收到编译完成消息后，执行绑定
            addGenerateQueue({assetInfo: result, autoBindingData})
        } else {
            console.log(`doAutoFile fail`);
        }
    }

    async function doAutoBinding(msg: AssetInfo) {
        let nodeName = nodeDump.name.value as string;
        let nodeNameAutoBinding = `${nodeName}AutoBinding`;
        let scriptName = msg.name.split(`.`)[0];
        // console.log(`doAutoBinding nodeNameAutoBinding = ${nodeNameAutoBinding} scriptName = ${scriptName}`);
        if (nodeNameAutoBinding != scriptName) {
            return;
        }
        console.log(`doAutoBinding start`);
        let autoBindingCompDump;
        let autoBindingCompIndex: number;
        for (let index = 0; index < nodeDump.__comps__.length; index++) {
            const element = nodeDump.__comps__[index];
            let compType = getTypeName(element.type as string);
            if (nodeNameAutoBinding == compType) {
                autoBindingCompDump = element;
                autoBindingCompIndex = index;
                break;
            }
        }

        if (!autoBindingCompDump) {
            await Editor.Message.request("scene", "create-component", {uuid: nodeDump.uuid.value as string, component: scriptName});
            autoBindingCompIndex = nodeDump.__comps__.length;
        } else {
            // @ts-ignore
            let compUuid = autoBindingCompDump.value[`uuid`][`value`];
            await Editor.Message.request("scene", "reset-component", {uuid: compUuid});
        }

        let bindingProperties: IBindingProperties[] = await getBindingProperties();
        // console.log(`doAutoBinding bindingProperties`, bindingProperties);
        // async await 在forEach中使用无效
        for (let index = 0; index < bindingProperties.length; index++) {
            const element = bindingProperties[index];
            await Editor.Message.request("scene", "set-property",{
                uuid: nodeDump.uuid.value as string,
                path:`__comps__.${autoBindingCompIndex!}.${element.name}`,
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
}