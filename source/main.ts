
/**
 * @en Methods within the extension can be triggered by message
 * @zh 扩展内的方法，可以通过 message 触发
 */
export const methods: { [key: string]: (...any: any) => any } = {
    onCompiledHandler() {
        console.log(`onCompiledHandler`);
        Editor.Message.send('scene', 'execute-scene-script', {
            name: 'ui-autobinding',
            method: 'generate',
            args: [],
        });
    }
};

/**
 * @en The method executed when the extension is started
 * @zh 扩展启动的时候执行的方法
 */
export function load() {
}

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展触发的方法
 */
export function unload() { }
