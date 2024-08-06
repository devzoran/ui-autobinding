"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = void 0;
/**
 * @en Methods within the extension can be triggered by message
 * @zh 扩展内的方法，可以通过 message 触发
 */
exports.methods = {
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
function load() {
}
exports.load = load;
/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展触发的方法
 */
function unload() { }
exports.unload = unload;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBOzs7R0FHRztBQUNVLFFBQUEsT0FBTyxHQUE0QztJQUM1RCxpQkFBaUI7UUFDYixPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFtQixDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFO1lBQ2pELElBQUksRUFBRSxnQkFBZ0I7WUFDdEIsTUFBTSxFQUFFLFVBQVU7WUFDbEIsSUFBSSxFQUFFLEVBQUU7U0FDWCxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0osQ0FBQztBQUVGOzs7R0FHRztBQUNILFNBQWdCLElBQUk7QUFDcEIsQ0FBQztBQURELG9CQUNDO0FBRUQ7OztHQUdHO0FBQ0gsU0FBZ0IsTUFBTSxLQUFLLENBQUM7QUFBNUIsd0JBQTRCIiwic291cmNlc0NvbnRlbnQiOlsiXHJcbi8qKlxyXG4gKiBAZW4gTWV0aG9kcyB3aXRoaW4gdGhlIGV4dGVuc2lvbiBjYW4gYmUgdHJpZ2dlcmVkIGJ5IG1lc3NhZ2VcclxuICogQHpoIOaJqeWxleWGheeahOaWueazle+8jOWPr+S7pemAmui/hyBtZXNzYWdlIOinpuWPkVxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IG1ldGhvZHM6IHsgW2tleTogc3RyaW5nXTogKC4uLmFueTogYW55KSA9PiBhbnkgfSA9IHtcclxuICAgIG9uQ29tcGlsZWRIYW5kbGVyKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBvbkNvbXBpbGVkSGFuZGxlcmApO1xyXG4gICAgICAgIEVkaXRvci5NZXNzYWdlLnNlbmQoJ3NjZW5lJywgJ2V4ZWN1dGUtc2NlbmUtc2NyaXB0Jywge1xyXG4gICAgICAgICAgICBuYW1lOiAnZnQtYXV0b2JpbmRpbmcnLFxyXG4gICAgICAgICAgICBtZXRob2Q6ICdnZW5lcmF0ZScsXHJcbiAgICAgICAgICAgIGFyZ3M6IFtdLFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIEBlbiBUaGUgbWV0aG9kIGV4ZWN1dGVkIHdoZW4gdGhlIGV4dGVuc2lvbiBpcyBzdGFydGVkXHJcbiAqIEB6aCDmianlsZXlkK/liqjnmoTml7blgJnmiafooYznmoTmlrnms5VcclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBsb2FkKCkge1xyXG59XHJcblxyXG4vKipcclxuICogQGVuIE1ldGhvZCB0cmlnZ2VyZWQgd2hlbiB1bmluc3RhbGxpbmcgdGhlIGV4dGVuc2lvblxyXG4gKiBAemgg5Y246L295omp5bGV6Kem5Y+R55qE5pa55rOVXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gdW5sb2FkKCkgeyB9XHJcbiJdfQ==