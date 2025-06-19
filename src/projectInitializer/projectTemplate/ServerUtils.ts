export namespace ServerUtils {
  export type ServerStartArgs = Record<string, string | boolean | number>;
  export type ServerStartAction = (args: ServerStartArgs) => void;
  export function onServerStart(action: ServerStartAction) {
    let finalAction = (args: ServerStartArgs) => {
      try {
        action(args);
      } catch (e) {
        console.error(e);
      }
    };
    ServerUtilsInternal.onServerStartActions.push(finalAction);
  }
}

namespace ServerUtilsInternal {
  export const onServerStartActions: ServerUtils.ServerStartAction[] = [];

  export function startServer(args: ServerUtils.ServerStartArgs) {
    onServerStartActions.forEach((action) => action(args ?? {}));
  }
}
