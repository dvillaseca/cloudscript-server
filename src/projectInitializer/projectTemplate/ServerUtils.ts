export namespace ServerUtils {
  export function onServerStart(action: Function) {
    let finalAction = () => {
      try {
        action();
      } catch (e) {
        console.error(e);
      }
    };
    ServerUtilsInternal.onServerStartActions.push(finalAction);
  }
}

namespace ServerUtilsInternal {
  export const onServerStartActions: Function[] = [];

  export function startServer() {
    onServerStartActions.forEach((action) => action());
  }
}
