import * as React from "react"
// import styled from "styled-components"
import * as yup from "yup" // for everything
import { AsyncTrunk, ignore } from "mobx-sync"
import { deepObserve } from "mobx-utils"
import {
  // useLocalStore,
  useObserver
} from "mobx-react-lite"
import get from "lodash/get"
import set from "lodash/set"
import { observable, reaction, IReactionDisposer } from "mobx"
// import { useLocalStore, useObserver } from "mobx-react";
// import { computedFn } from "mobx-utils"

import { CONTEXTS } from "./contexts"
// import { usePreventWindowUnload } from "hooks"

const win = window as any

type TFormikActions = Pick<IFormikInternalStore, "setSubmitting" | "setErrors"> & {}

type IFormikChildFunction = (options: {
  ctxData: IFormikContext
  ctx: React.Context<unknown>
  internal: IFormikInternalStore
  actions: TFormikActions
}) => JSX.Element

const handleBeforeUnload = (ev: BeforeUnloadEvent) => {
  ev.preventDefault()
  ev.returnValue = `You have unsaved changes. are you sure you want to leave?`
}

export interface IFormik {
  preventUnloadWhenDirty?: boolean
  persistBlacklist?: string[]
  undoManagerBlacklist?: string[]
  FallbackComponent?: React.ComponentType
  schema?: yup.Schema<unknown>
  children?: JSX.Element | IFormikChildFunction
  // validate?: (values: TFormikValues) => void;
  // internalStore: TFormikValues
  initialValues: Record<string, any>
  onSubmit: (
    ev: React.FormEvent<HTMLFormElement>,
    values: IFormikInternalStore["values"],
    actions: TFormikActions
  ) => void
}

export interface IFormikInternalStore {
  undoManager?: UndoManager
  submitting: boolean
  touched: Record<string, any>
  modified: Record<string, any>
  initialValues: IFormik["initialValues"]
  values: IFormik["initialValues"]
  errors: Record<string, any>
  setSubmitting: (submitting: boolean) => void
  setErrors: (errors: IFormikInternalStore["errors"]) => void
  clean: () => void
  lastSuccess: number
  lastFailure: number
  valid: boolean
  dirty: boolean
}

type TObserverListener = Parameters<typeof deepObserve>[1]

class UndoManager {
  state: "OFF" | "ON" = "ON"
  history: any[] = []
  historyJumpCount = 0

  historyTrackerCB?: TObserverListener
  store: Record<string, any>
  blacklist: string[]

  constructor(
    store: Record<string | number, any>,
    blacklist: string[],
    historyTracker?: TObserverListener | undefined
  ) {
    this.store = store
    this.blacklist = blacklist
    this.historyTrackerCB = historyTracker
    // debugger
  }

  historyTracker: TObserverListener = (...args) => {
    if (this.state === "OFF") return // skip

    const [change, path] = args

    if (this.historyTrackerCB) {
      this.historyTrackerCB(...args)
    }

    //   (change, path) => {
    console.log("change", { path })
    console.dir(change)
    //  }
    // change.object
    // change.object.oldValue
    // change.object.newValue
    // change.object.removed
    // change.object.added
    // change.object.addedCount
    // change.type

    const snapshot = JSON.parse(
      JSON.stringify({
        change,
        path
      })
    )

    this.history.push(snapshot)
  }

  initHistory = () => {
    // debugger
    const disposer = deepObserve(this.store, this.historyTracker)
    // debugger
    return disposer
  }

  get historyVersion() {
    return this.history[this.history.length - 1 - this.historyJumpCount]
  }

  pause = () => {
    this.state = "OFF"
  }

  resume = () => {
    this.state = "ON"
  }

  syncStore = () => {
    const version = this.historyVersion

    this.pause()
    // Deletes all data in store
    // for (const key in this.store) {
    //   delete this.store[key]
    // }

    const { name, newValue } = version.change // type, object
    this.store[name] = newValue
    // Replaces all data
    // for (const key in object) {
    //   this.store[key] = object[key]
    // }

    this.resume()
    return version
  }

  undo = () => {
    if (this.historyJumpCount + 1 < this.history.length - 1) {
      this.historyJumpCount++
    }
    return this.syncStore()
  }

  redo = () => {
    if (this.historyJumpCount - 1 >= 0) {
      this.historyJumpCount--
    }
    return this.syncStore()
  }
}

export interface IFormikContext {
  onSubmit: (ev: React.FormEvent<HTMLFormElement>) => void
  internal: IFormikInternalStore
}

export const Formik = React.memo<IFormik>(props => {
  const [store, setStore] = React.useState<IFormikInternalStore | null>(null)

  React.useEffect(() => {
    const internal = observable<IFormikInternalStore>({
      lastSuccess: 0,
      lastFailure: 0,
      initialValues: JSON.parse(JSON.stringify(props.initialValues)),
      values: props.initialValues,
      submitting: false,
      touched: {},
      modified: {},
      errors: {},
      get dirty() {
        const store = internal as IFormikInternalStore
        const modified = store.modified
        const dirty = !!Object.keys(modified).length
        return dirty
      },
      get valid() {
        const store = internal as IFormikInternalStore
        const errors = store.errors
        const valid = !Object.keys(errors).length
        return valid
      },
      setSubmitting(submitting) {
        internal.submitting = submitting
      },
      setErrors(errors) {
        internal.errors = errors
      },
      clean() {
        for (const key in internal.modified) {
          delete internal.modified[key]
        }
        for (const key in internal.touched) {
          delete internal.touched[key]
        }
      }
    })

    //
    // Submitting reaction
    const disposerSubmitting = reaction(
      () => internal.submitting,
      submitting => {
        requestAnimationFrame(() => {
          if (!internal.submitting) {
            if (Object.keys(internal.errors).length) {
              internal.lastFailure = Date.now()
            } else {
              internal.lastSuccess = Date.now()
              internal.clean()
              // debugger
            }
          }
        })
      }
    )

    //
    // Submitting reaction
    let disposerWindowUnload: IReactionDisposer
    if (props.preventUnloadWhenDirty) {
      disposerWindowUnload = reaction(
        () => internal.dirty,
        dirty => {
          if (dirty) {
            window.addEventListener("beforeunload", handleBeforeUnload)
          } else {
            window.removeEventListener("beforeunload", handleBeforeUnload)
          }
        }
      )
    }

    //
    // Undo Manager
    if (props.undoManagerBlacklist) {
      internal.undoManager = new UndoManager(internal.values, props.undoManagerBlacklist, (change, path, root) => {
        const name = (change as any).name as string
        internal.modified[name] = true
      })

      win["__undoManager__" + Math.round(Math.random() * 100)] = internal.undoManager // debugging
    }

    //
    // Persistance
    const ignoreKeys = [
      "undoManager",
      "lastSuccess",
      "lastFailures",
      "initialValues",
      "submitting",
      "touched",
      "errors"
    ]
    for (const ignoreKey of ignoreKeys) {
      ignore(internal, ignoreKey)
    }

    const onInit = () => {
      internal.undoManager?.initHistory()

      win["__formik__"] = internal
      // Set Store
      setStore(internal)
    }

    if (props.persistBlacklist) {
      const trunk = new AsyncTrunk(internal, {
        storage: localStorage,
        delay: 200
      })

      trunk.init().then(() => {
        // Start Undo Manager
        onInit()
      })
    } else {
      onInit()
    }

    return () => {
      disposerSubmitting()
      disposerWindowUnload?.()
    }
  }, [])

  if (!store) {
    return props.FallbackComponent ? <props.FallbackComponent /> : null
  }

  return <FormikInternal internal={store} {...props} />
})

export const FormikInternal = React.memo<IFormik & { internal: IFormikInternalStore }>(
  ({ schema, children, onSubmit, internal }) => {
    const ctx = CONTEXTS["formik"]

    const [actions] = React.useState<TFormikActions>(() => {
      return {
        setSubmitting: internal.setSubmitting,
        setErrors: internal.setErrors
      }
    })

    const onSubmitWrapped = async (ev: React.FormEvent<HTMLFormElement>) => {
      if (internal.submitting) return
      // todo timeout and give a callback to cancel request?
      internal.submitting = true

      for (const key in internal.errors) {
        delete internal.errors[key as string]
      }

      try {
        if (schema) {
          ev.preventDefault()
          await schema.validate(internal.values, { abortEarly: false })
        }
      } catch (error) {
        for (const e of error.inner) {
          internal.errors[e.path] = e.message
        }
        internal.submitting = false
        return
      }

      onSubmit(ev, internal, actions)
    }

    const ctxData: IFormikContext = {
      onSubmit: onSubmitWrapped,
      internal
    }

    return (
      <ctx.Provider value={ctxData}>
        {typeof children === "function" ? children({ ctxData, ctx, internal, actions }) : children}
      </ctx.Provider>
    )
  }
)

type IFieldChildrenFunction = (options: { value: any; touched: boolean; error: any }) => any
type IFieldChildren = JSX.Element | IFieldChildrenFunction

interface IField extends React.InputHTMLAttributes<HTMLInputElement> {
  children?: IFieldChildren
  placeholder?: string
  type?: string
  readOnly?: boolean
  computedName?: string
  computedId?: string | number
  Component?: any
}

export const useFormikCtx: () => IFormikContext = () => {
  const ctx = React.useContext(CONTEXTS["formik"]) as IFormikContext
  return ctx
}

export const ObserveFormik = ({ children }: { children: (ctx: IFormikContext) => JSX.Element }) => {
  const ctx = useFormikCtx()
  return useObserver<JSX.Element>(() => {
    return children(ctx)
  })
}

export const Field = React.memo<IField>(
  ({
    children,
    onChange: originalOnChange,
    onBlur: originalOnBlur,
    Component,
    readOnly,
    name,
    placeholder,
    computedName,
    computedId,
    type,
    ...rest
  }) => {
    if (!name && !computedName) throw new Error("Missing Field name")

    const ctx = useFormikCtx()

    const onChange = React.useCallback(ev => {
      if (!name) throw new Error("We can't hook to onChange on computed")
      const value = ev.target.value
      console.log("formikmmobix on change field", ev, value)
      set(ctx.internal.values, name, value)
      const ctxval = get(ctx.internal.values, name)
      console.log({ ctx, ctxval })
      if (originalOnChange) {
        originalOnChange(ev)
      }
    }, [])

    const onBlur = React.useCallback(ev => {
      if (!name) throw new Error("We can't hook to onChange on computed")
      console.log("[Formik] [Field] onBlur", ev)
      set(ctx.internal.touched, name, true)
      if (originalOnBlur) {
        originalOnBlur(ev)
      }
    }, [])

    return useObserver(() => {
      let value = computedName
        ? ctx.internal.values[computedName](computedId ? String(computedId) : undefined)
        : name
        ? get(ctx.internal.values, name)
        : undefined
      // value = `${
      //   typeof value === "string" || typeof value === "number" ? value : ""
      // }`

      // const changed = !computedName && name && get(ctx.internal.touched, name)
      // const touched = !computedName && name && get(ctx.internal.touched, name)
      let initialValue = name && get(ctx.internal.initialValues, name)
      // const initialValueIsOff =
      //   typeof initialValue === "undefined" || initialValue === null
      const valueIsOff = typeof value === "undefined" || value === null
      // alert(typeof value)
      // const touched =
      //   !computedName && name && initialValue !== value && !valueIsOff
      const touched = name && get(ctx.internal.modified, name)

      // ((typeof initialValue === "string" && !!value) ||
      //   typeof initialValue !== "string")
      const error = !computedName && name && get(ctx.internal.errors, name)
      const disabled = ctx.internal.submitting

      console.log("Field: " + name, {
        value,
        name,
        ctx,
        computedName,
        computedId
      })

      const InputComponent = Component || "input"

      const extraProps = Component
        ? {
            touched,
            error
          }
        : undefined

      if (typeof children === "function") {
        const extraProps = Component
        return children({ value, ...extraProps })
      }

      return (
        <InputComponent
          disabled={disabled}
          {...rest}
          {...extraProps}
          {...{
            value: value || "",
            type,
            readOnly,
            name,
            placeholder,
            onChange,
            onBlur
          }}
        />
      )
    })
  }
)

interface IFieldError {
  name: string
  children: (error: string) => any
}

export const ErrorField = React.memo<IFieldError>(({ name, children }) => {
  if (!name) throw new Error("Missing Field name")
  const ctx = useFormikCtx()

  return useObserver(() => {
    const error = get(ctx.internal.errors, name)

    console.log("Error Field: " + name, {
      name,
      error
    })

    if (!error) return null

    return children(error)
  })
})

interface IForm {
  // children: any
  Component?: any
}

export const Form: React.FC<IForm> = ({ Component, ...rest }) => {
  const ctx = useFormikCtx()

  // const onSubmit = React.useCallback(ev => {
  //   // const value = ev.target.value
  //   // set(ctx, name, value)
  //   // const ctxval = get(ctx, name)
  //   // console.log({ ctx, ctxval })
  // }, [])

  // return useObserver(() => {
  // let value = computedName
  //   ? ctx[computedName](String(computedId))
  //   : get(ctx, name)
  // value = `${
  //   typeof value === "string" || typeof value === "number" ? value : ""
  // }`

  const FormComponent = Component || ((p: any) => <form {...p} />)

  return (
    <FormComponent
      onSubmit={ctx.onSubmit}
      // value={value}
      // {...{ type, readOnly, name, placeholder, onChange }}
      {...rest}
    />
  )
  // })
}

export interface IFieldArrayOptions {
  // move?: any;
  // swap?: any;
  add?: (obj: any) => void
  remove?: (id: string | number) => void
  // insert?: any;
  // unshift?: any;
  // pop?: any;
  form?: any
}

export interface IFieldArray {
  name: string
  children: (options: IFieldArrayOptions) => any
}

export const FieldArray = React.memo<IFieldArray>(({ children, name }) => {
  // TODO
  // [] Get from context
  // useContext type ?
  const ctx = useFormikCtx()

  // {
  //   productLines: [{}]
  // }

  const addCallback = React.useCallback((obj: any) => {
    const target = get(ctx.internal.values, name)
    console.log("addCallback ", { name, ctx, target, obj })
    if (typeof target === "object") {
      if (Array.isArray(target)) {
        target.push(obj)
      } else {
        set(target, obj.id, obj)
      }
    }
  }, [])

  const removeCallback = React.useCallback((id: string | number) => {
    const target = get(ctx.internal.values, name)
    console.log("pushCallback ", { name, ctx, target, id })
    if (typeof target === "object") {
      if (Array.isArray(target)) {
        const index = target.findIndex(o => o.id === id)
        target.splice(index, 1)
      } else {
        // set(target, obj.id, obj);
        delete target[id]
      }
    }
  }, [])

  const options = {
    add: addCallback,
    remove: removeCallback,
    form: {
      values: ctx.internal.values
      // values: ctx.
    }
  }

  return useObserver(() => {
    const values = get(ctx, name)
    console.log("FieldArray", { values })
    return children(options)
  })
})

// const ProductLine = React.memo<{ computedId: string | number; name: string }>(
//   ({ name, computedId }) => {
//     console.log("ProductLine", { name, computedId })
//     return (
//       <>
//         <Td>
//           <Field name={name + ".unitPrice"} placeholder="$0.00" type="number" />
//         </Td>
//         <Td>
//           <Field name={name + ".qty"} placeholder="0" type="number" />
//         </Td>
//         <Td>
//           <Field
//             readOnly
//             name={name}
//             computedName="totalForLine"
//             computedId={computedId}
//             placeholder="$0.00"
//           />
//         </Td>
//       </>
//     )
//   }
// )

// interface IProductLine {
//   id: string | number
//   _local?: boolean
//   qty?: number
//   unitPrice?: number
// }
// const generateLocalProductLine = () => {
//   return {
//     _local: true,
//     id: Date.now() + Math.floor(Math.random() * 100000)
//   } as IProductLine
// }

// const ProductLineController = React.memo<{
//   id: string | number
//   productLine: IProductLine
//   showAddButton?: boolean
//   showDeleteButton?: boolean
//   add: (obj: any) => void
//   remove: (id: string | number) => void
// }>(({ id, productLine, showAddButton, showDeleteButton, add, remove }) => {
//   console.log("ProductLineController render --", { id })
//   return (
//     <Tr key={id}>
//       <ProductLine
//         computedId={id}
//         name={`productLines[${id}]`}
//         {...{ productLine }}
//       />
//       <Td>
//         {showAddButton && (
//           <Button
//             type="button"
//             onClick={() => {
//               add(generateLocalProductLine())
//             }}
//           >
//             Add +
//           </Button>
//         )}
//         {showDeleteButton && (
//           <Button
//             type="button"
//             onClick={() => {
//               remove(id)
//             }}
//           >
//             X
//           </Button>
//         )}
//       </Td>
//     </Tr>
//   )
// })

// const TotalsRow = React.memo(() => {
//   // TODO Rename to store
//   const ctx = React.useContext<{ total: number | string }>(CONTEXTS["formik"])

//   return useObserver(() => {
//     // const values = get(ctx, name);
//     // console.log("FieldArray", { values });
//     // return children(options);
//     const { total } = ctx
//     console.log("TotalsRow -- ", { total })
//     return (
//       <Tr>
//         <Td />
//         <Td>Total:</Td>
//         <Td>{total}</Td>
//         <Td />
//       </Tr>
//     )
//   })
// })

// const Controls = React.memo(() => {
//   // TODO Rename to store
//   const ctx = React.useContext<{ total: number | string }>(CONTEXTS["formik"])

//   const generateProductLines = React.useCallback(
//     count => () => {
//       for (let i = 0; i < count; i++) {
//         const line = generateLocalProductLine()
//         line.qty = Math.round(Math.random() * 100)
//         line.unitPrice = Number((Math.random() * 100).toFixed(2))
//         ctx.productLines[line.id] = line
//       }
//     },
//     []
//   )

//   return (
//     <Box>
//       <Button type="button" onClick={generateProductLines(1)}>
//         Generate Random 1
//       </Button>
//       <Button type="button" onClick={generateProductLines(10)}>
//         Generate Random 10
//       </Button>
//       <Button type="button" onClick={generateProductLines(100)}>
//         Generate Random 100
//       </Button>
//       <Button type="button" onClick={generateProductLines(1000)}>
//         Generate Random 1000
//       </Button>
//     </Box>
//   )
// })

// const Content = React.memo(() => {
//   return (
//     <Table>
//       <Thead>
//         <Tr>
//           <Th>Price</Th>
//           <Th>Qty</Th>
//           <Th>Total</Th>
//           <Th />
//         </Tr>
//       </Thead>
//       <Tbody>
//         <FieldArray name="productLines">
//           {({ add, remove, form }) => {
//             // return useObserver(() => {
//             const productLines = form.values.productLines as {
//               [key: string]: IProductLine
//             }
//             const productLinesKeys = Object.keys(productLines)
//             const lastProcuctLineKey =
//               productLinesKeys[productLinesKeys.length - 1]
//             const lastProcuctLine = productLines[lastProcuctLineKey]

//             console.log("FieldArray productLines count", {
//               productLines: productLinesKeys.length
//             })

//             return (
//               <>
//                 {Object.values(productLines).map((productLine, index) => {
//                   const id = productLine.id
//                   const showAddButton = productLine === lastProcuctLine
//                   const showDeleteButton = !showAddButton
//                   console.log(
//                     "render product lines map --- (" + index + ") id: " + id,
//                     {
//                       productLine
//                     }
//                   )

//                   return (
//                     <ProductLineController
//                       key={id}
//                       {...{
//                         id,
//                         showAddButton,
//                         showDeleteButton,
//                         productLine,
//                         add,
//                         remove
//                       }}
//                     />
//                   )
//                 })}
//               </>
//             )
//             // });
//           }}
//         </FieldArray>
//         <TotalsRow />
//       </Tbody>
//     </Table>
//   )
// })

// const App = React.memo(() => {
//   // isn't this re-render?
//   console.log("APPP -----")

//   const store = useLocalStore(() => {
//     console.log("STORE ---", Math.random())
//     const initLine = generateLocalProductLine()
//     return {
//       productLines: { [initLine.id]: initLine },
//       totalForLine: computedFn(lineID => {
//         const { unitPrice, qty } = store.productLines[lineID]
//         const total = unitPrice * qty || 0
//         // store.productLines[lineID].unitPrice
//         console.log("TOTAL FOR LINE ", { lineID, total })
//         return total
//       }),
//       get total() {
//         const total = Object.keys(store.productLines).reduce((acc, lineID) => {
//           return acc + store.totalForLine(String(lineID))
//         }, 0)
//         return total
//       }
//     }
//   })

//   const op = computed(() => store.total)

//   autorun((a, b) => console.log("op2", op, op.get(), a, b), {
//     delay: 1000
//   })

//   console.log("APP --useLocalStore", { store })

//   return (
//     <Box className="App">
//       <Formik
//         store={store}
//         // validate={values => {
//         //   console.log("VALIDATE", { values });
//         //   // const errors = {};
//         //   // if (values.token.length < 5) {
//         //   //   errors.token = "Invalid code. Too short.";
//         //   // }
//         //   // return errors;
//         // }}
//         // onSubmit={(values, actions) => {
//         //   setTimeout(() => {
//         //     // alert(JSON.stringify(values, null, 2));
//         //     actions.setSubmitting(false);
//         //   }, 1000);
//         // }}
//       >
//         <Form>
//           <Content />
//         </Form>
//         <Controls />
//       </Formik>
//     </Box>
//   )
// })

// const rootElement = document.getElementById("root")
// // render(<App />, rootElement);
// ReactDOM.createRoot(rootElement).render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>
// )
// // ReactDOM.render(<App />, rootElement);

// const DefaultInput = styled.input``
