import * as yup from "yup"

describe("yup", () => {
  it("errors", async () => {
    expect.assertions(1)

    const schema = yup.object().shape({
      name: yup.string().strict(true),
      age: yup.number(),
      street: yup.string().strict(true)
    })

    const data = {
      name: 234,
      age: "2f3",
      street: 2394
    }

    try {
      await schema.validate(data, { abortEarly: false })
    } catch (error) {
      expect(error.inner.map((i: any) => i.path)).toEqual([
        "name",
        "age",
        "street"
      ])
    }
  })
})
