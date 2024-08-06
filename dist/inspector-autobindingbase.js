'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const path = require('path');
const componentsPath = path.join(Editor.App.path, '../resources/3d/engine/editor/inspector/components');
const { template, $, update, close } = require(path.join(componentsPath, './base'));
exports.template = template;
exports.$ = $;
exports.update = update;
exports.close = close;

exports.style = `
.container {
    margin-top: 10px;
    margin-bottom: 5px;
    text-align: center;
    border: dashed 1px #6b6b6b;
    border-radius: 4px;
}
`;
function ready() {
    this.elements = {
        autoBinding: {
            create() {
                const prop = document.createElement('ui-prop');
                prop.setAttribute('class', 'container');
                const checkbox = document.createElement('ui-checkbox');
                checkbox.setAttribute('class', 'autoBinding');
                checkbox.value = false;
                checkbox.innerText = `AutoBinding`;
                checkbox.addEventListener("confirm", async () => {
                    await setAutoBinding.call(this, this.dump, checkbox.value);
                });
                prop.appendChild(checkbox);
                return prop;
            },
            async update(element, dump) {
                this.dump = dump;
                const checkbox = element.querySelector('ui-checkbox');
                checkbox.value = await getAutoBinding.call(this, this.dump);
            },
        }
    }
}
exports.ready = ready;
async function getAutoBindingMap(dump) {
    let autoBindingData = { prefabUuid: ``, autoBindingMap: {} };
    // 根据组件的节点uuid找到节点的INode dump数据
    let nodeDump = await Editor.Message.request('scene', 'query-node', dump.node.value.uuid);
    // 查询父节点对应的节点，将组件添加到父节点对应的prefab中去
    nodeDump = await Editor.Message.request('scene', 'query-node', nodeDump.parent.value.uuid);
    // 根据节点对应的prefab查询使用了资源 UUID 的节点
    if (!nodeDump.__prefab__) {
        this.$['autoBinding'].setAttribute('hidden', '');
        return autoBindingData
    }
    // nodeDump.parent.value.uuid
    autoBindingData.prefabUuid = nodeDump.__prefab__.uuid;
    let prefabNodeuuids = await Editor.Message.request("scene", "query-nodes-by-asset-uuid", autoBindingData.prefabUuid);
    if (prefabNodeuuids.length <= 0) {
        this.$['autoBinding'].setAttribute('hidden', '');
        return autoBindingData
    }
    let prefabNodeDump = await Editor.Message.request("scene", "query-node", prefabNodeuuids[0]);
    if (!prefabNodeDump) {
        this.$['autoBinding'].setAttribute('hidden', '');
        return autoBindingData
    }
    this.$['autoBinding'].removeAttribute('hidden');
    // 找到自动绑定组件，判断对应的绑定uuid和当前组件的uuid是否一致，一致则表示选中
    let nodeName = prefabNodeDump.name.value;
    let nodeNameAutoBinding = `${nodeName}AutoBinding`;
    for (let index = 0; index < prefabNodeDump.__comps__.length; index++) {
        const element = prefabNodeDump.__comps__[index];
        if (element.type == nodeNameAutoBinding) {
            for (const [key, value] of Object.entries(element.value)) {
                let v = value;
                try {
                    if (v.extends && v.extends.includes("cc.Component")) {
                        autoBindingData.autoBindingMap[v.value.uuid] = true;
                    }
                } catch (error) {
                    console.log(`v`,v);
                    console.log(error);
                }
            }
        }
    }
    return autoBindingData;
}
async function getAutoBinding(dump) {
    let autoBindingData = await getAutoBindingMap.call(this, dump);
    return autoBindingData.autoBindingMap[dump.uuid.value] || false;
}
async function setAutoBinding(dump, value) {
    let autoBindingData = await getAutoBindingMap.call(this, dump);
    autoBindingData.autoBindingMap[dump.uuid.value] = value;
    Editor.Message.send('scene', 'execute-scene-script', {
        name: 'ui-autobinding',
        method: 'updateAutoBinding',
        args: [autoBindingData],
    });
}