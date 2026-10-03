import { fireEvent, render, screen } from "@testing-library/react"
import { Calendar } from "../calendar"
import { DateRangePicker } from "../date-range-picker"

const september = new Date(2026, 8, 1)

// Outside days repeat the numbers of the next and previous month, so skip them.
function dayButton(container: HTMLElement, day: number) {
    const button = Array.from(container.querySelectorAll("button")).find(
        b => b.textContent === String(day) && !b.classList.contains("day-outside")
    )
    if (!button) throw new Error(`no button for day ${day}`)
    return button
}

function isSelected(button: HTMLElement) {
    return button.closest('[aria-selected="true"]') !== null
}

function ymd(date: Date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
}

describe("Calendar", () => {
    it("styles the selected day and today as the design system buttons", () => {
        const { container } = render(
            <Calendar mode="single" selected={new Date(2026, 8, 15)} defaultMonth={september} today={new Date(2026, 8, 10)} />
        )

        const selected = dayButton(container, 15)
        expect(isSelected(selected)).toBe(true)
        expect(selected).toHaveClass("bg-primary", "text-primary-foreground", "h-9", "w-9")
        expect(dayButton(container, 10)).toHaveClass("bg-accent", "text-accent-foreground")
        expect(isSelected(dayButton(container, 16))).toBe(false)
        expect(dayButton(container, 16)).not.toHaveClass("bg-primary")
    })

    it("styles a disabled day as muted", () => {
        const { container } = render(
            <Calendar mode="single" defaultMonth={september} disabled={date => date < new Date(2026, 8, 10)} />
        )

        expect(dayButton(container, 5)).toHaveClass("text-muted-foreground", "opacity-50")
    })

    it("marks the days of a range and its end", () => {
        const { container } = render(
            <Calendar mode="range" defaultMonth={september} selected={{ from: new Date(2026, 8, 15), to: new Date(2026, 8, 18) }} />
        )

        for (const day of [15, 16, 17, 18]) expect(isSelected(dayButton(container, day))).toBe(true)
        expect(isSelected(dayButton(container, 19))).toBe(false)
        expect(dayButton(container, 18)).toHaveClass("day-range-end")
        expect(dayButton(container, 16)).not.toHaveClass("day-range-end")
    })

    it("navigates months with the lucide chevrons", () => {
        const { container } = render(<Calendar mode="single" defaultMonth={september} />)

        expect(container.querySelector("svg.lucide-chevron-left")).not.toBeNull()
        const next = container.querySelector("svg.lucide-chevron-right")?.closest("button")
        if (!next) throw new Error("no next-month button")
        fireEvent.click(next)
        expect(screen.getByText("October 2026")).toBeInTheDocument()
    })
})

describe("DateRangePicker", () => {
    it("opens on the selected month, focuses a day and reports the picked range", () => {
        const onChange = jest.fn()
        render(<DateRangePicker value={{ from: new Date(2026, 8, 15), to: undefined }} onChange={onChange} numberOfMonths={1} />)

        fireEvent.click(screen.getByRole("button", { name: /15 Σεπ 2026/ }))
        expect(screen.getByText("September 2026")).toBeInTheDocument()
        expect(document.activeElement?.textContent).toBe("15")

        fireEvent.click(dayButton(document.body, 20))
        const range = onChange.mock.calls[0][0]
        expect(ymd(range.from)).toEqual([2026, 9, 15])
        expect(ymd(range.to)).toEqual([2026, 9, 20])
    })
})
