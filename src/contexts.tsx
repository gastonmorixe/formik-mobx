import * as React from "react";

export type TContext = Record<any, ReturnType<typeof React.createContext>>;

export const CONTEXTS: TContext = (function() {
  const contextsByName: TContext = {};

  const handler: ProxyHandler<typeof contextsByName> = {
    get: function(obj, prop) {
      if (!(prop in obj)) {
        obj[prop as any] = React.createContext<unknown>(undefined); // TODO initialize with proxy ??
      }
      return obj[prop as any];
    }
  };

  const proxy = new Proxy(contextsByName, handler);

  return proxy;
})();
