import { fireEvent, render, screen } from "@testing-library/react"
import { el } from "date-fns/locale"
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

    it("calls onSelect with the clicked date in single mode", () => {
        const onSelect = jest.fn()
        const { container } = render(<Calendar mode="single" defaultMonth={september} onSelect={onSelect} />)

        fireEvent.click(dayButton(container, 20))
        expect(onSelect).toHaveBeenCalledTimes(1)
        expect(ymd(onSelect.mock.calls[0][0])).toEqual([2026, 9, 20])
    })

    it("does not select a disabled day", () => {
        const onSelect = jest.fn()
        const { container } = render(
            <Calendar mode="single" defaultMonth={september} onSelect={onSelect} disabled={date => date < new Date(2026, 8, 10)} />
        )

        const disabled = dayButton(container, 5)
        expect(disabled).toBeDisabled()
        expect(disabled).toHaveClass("text-muted-foreground", "opacity-50")
        fireEvent.click(disabled)
        expect(onSelect).not.toHaveBeenCalled()
        expect(dayButton(container, 10)).toBeEnabled()
    })

    it("marks the days of a range and completes a range on the second day", () => {
        const onSelect = jest.fn()
        const { container, rerender } = render(
            <Calendar mode="range" defaultMonth={september} selected={{ from: new Date(2026, 8, 15), to: new Date(2026, 8, 18) }} onSelect={onSelect} />
        )

        for (const day of [15, 16, 17, 18]) expect(isSelected(dayButton(container, day))).toBe(true)
        expect(isSelected(dayButton(container, 19))).toBe(false)
        expect(dayButton(container, 18)).toHaveClass("day-range-end")
        expect(dayButton(container, 16)).not.toHaveClass("day-range-end")

        rerender(<Calendar mode="range" defaultMonth={september} selected={{ from: new Date(2026, 8, 15), to: undefined }} onSelect={onSelect} />)
        fireEvent.click(dayButton(container, 20))
        const range = onSelect.mock.calls[0][0]
        expect(ymd(range.from)).toEqual([2026, 9, 15])
        expect(ymd(range.to)).toEqual([2026, 9, 20])
    })

    it("renders month and weekday names in Greek and starts the week on Monday", () => {
        const { container } = render(<Calendar mode="single" defaultMonth={september} locale={el} />)

        expect(screen.getByText("Σεπτέμβριος 2026")).toBeInTheDocument()
        const weekdays = Array.from(container.querySelectorAll("thead th")).map(th => th.textContent)
        expect(weekdays).toHaveLength(7)
        expect(weekdays[0]).toMatch(/^Δε/)
        expect(weekdays[6]).toMatch(/^Κυ/)
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
