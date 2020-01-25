import * as React from "react"

interface IContext {
  [key: string]: React.Context<unknown>
}
// export type IContext<T> = {
//   [P in keyof T]: React.Context<T[P]>
// }

// type ICx = {
//   [key: string]: unknown
// }

// const ctx: IContext = {
//   ctx1: React.createContext({ name: "gaston" }),
//   ctx2: React.createContext({ name: "gaston" })
// }

export const CONTEXTS = (function(): IContext {
  const contextsByName: IContext = {}

  const handler: ProxyHandler<typeof contextsByName> = {
    get: function(obj, prop) {
      if (!(prop in obj)) {
        obj[prop as any] = React.createContext<unknown>(undefined) // TODO initialize with proxy ??
      }
      return obj[prop as any]
    }
  }

  const proxy = new Proxy(contextsByName, handler)

  return proxy
})()
