
'use strict';

type Selector<$> = { $: Record<keyof $, any | null> }
export const template = `
<div class="container">
<ui-checkbox class="autoBinding" value="false">AutoBinding</ui-checkbox>
</div>
`;

exports.style = `
.container {
    margin-top: 10px;
    margin-bottom: 5px;
    text-align: center;
    border: dashed 1px #6b6b6b;
    border-radius: 4px;
}
`;

export const $ = { 
    container: ".container",
    autoBinding: ".autoBinding"
};

export async function update(this: any, dump: any) {
    this.dump = dump;
    this.$.autoBinding.value = await getAutoBinding.call(this, this.dump);
}
export function ready(this: any) {
    this.$.autoBinding.addEventListener("confirm", async () =>{
        await setAutoBinding.call(this, this.dump, this.$.autoBinding.value);
    });
}

async function getAutoBindingMap(this: any, dump: any) {
    let autoBindingData: {prefabUuid:string, autoBindingMap: {[key: string]: boolean}} = {prefabUuid: ``, autoBindingMap: {}};
    // 根据组件的节点uuid找到节点的INode dump数据
    let nodeDump = await Editor.Message.request('scene', 'query-node', dump.value.node.value.uuid);
    if (!nodeDump.__prefab__) {
        this.$['container'].setAttribute('hidden', '');
        return autoBindingData
    }
    // 根据节点对应的prefab查询使用了资源 UUID 的节点
    autoBindingData.prefabUuid = nodeDump.__prefab__.uuid;
    let prefabNodeuuids = await Editor.Message.request("scene", "query-nodes-by-asset-uuid", autoBindingData.prefabUuid);
    if (prefabNodeuuids.length <= 0) {
        this.$['container'].setAttribute('hidden', '');
        return autoBindingData
    }
    let prefabNodeDump = await Editor.Message.request("scene", "query-node", prefabNodeuuids[0]);
    if (!prefabNodeDump) {
        this.$['container'].setAttribute('hidden', '');
        return autoBindingData
    }
    this.$['container'].removeAttribute('hidden');
    // 找到自动绑定组件，判断对应的绑定uuid和当前组件的uuid是否一致，一致则表示选中
    let nodeName = prefabNodeDump.name.value as string;
    let nodeNameAutoBinding = `${nodeName}AutoBinding`;
    for (let index = 0; index < prefabNodeDump.__comps__.length; index++) {
        const element = prefabNodeDump.__comps__[index];
        if (element.type == nodeNameAutoBinding) {
            for (const [key, value] of Object.entries(element.value as any)) {
                let v = value as any;
                try {
                    if (v.extends && v.extends.includes("cc.Component")) {
                        autoBindingData.autoBindingMap[v.value.uuid] = true
                    }
                } catch (error) {
                    console.log(v);
                    console.log(error);
                }
            }
        }
    }
    return autoBindingData;
}

async function getAutoBinding(this: any, dump: any) {
    let autoBindingData = await getAutoBindingMap.call(this, dump);
    return autoBindingData.autoBindingMap[dump.value.uuid.value] || false;
}

async function setAutoBinding(this: any, dump: any, value: boolean) {
    let autoBindingData = await getAutoBindingMap.call(this, dump);
    autoBindingData.autoBindingMap[dump.value.uuid.value] = value;

    Editor.Message.send('scene', 'execute-scene-script', {
        name: 'ui-autobinding',
        method: 'updateAutoBinding',
        args: [autoBindingData],
    });
}