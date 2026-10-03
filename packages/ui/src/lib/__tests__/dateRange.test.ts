import { addDayToRange } from "../dateRange"

const sep = (day: number) => new Date(2026, 8, day)

describe("addDayToRange", () => {
    it("starts an open range on the first click", () => {
        expect(addDayToRange(sep(10), undefined)).toEqual({ from: sep(10), to: undefined })
    })

    it("completes an open range in either direction", () => {
        expect(addDayToRange(sep(20), { from: sep(10), to: undefined })).toEqual({ from: sep(10), to: sep(20) })
        expect(addDayToRange(sep(5), { from: sep(10), to: undefined })).toEqual({ from: sep(5), to: sep(10) })
        expect(addDayToRange(sep(10), { from: sep(10), to: undefined })).toEqual({ from: sep(10), to: sep(10) })
    })

    it("changes a complete range the way react-day-picker 8 did", () => {
        const range = { from: sep(10), to: sep(20) }
        expect(addDayToRange(sep(10), range)).toBeUndefined()
        expect(addDayToRange(sep(20), range)).toEqual({ from: sep(20), to: undefined })
        expect(addDayToRange(sep(5), range)).toEqual({ from: sep(5), to: sep(20) })
        expect(addDayToRange(sep(15), range)).toEqual({ from: sep(10), to: sep(15) })
        expect(addDayToRange(sep(10), { from: sep(10), to: sep(10) })).toBeUndefined()
    })
})
