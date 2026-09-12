import { fireEvent, render, screen } from "@testing-library/react"
import { CheckboxCard } from "../checkbox-card"

describe("CheckboxCard", () => {
    it("is a checkbox whose whole header toggles it", () => {
        const onCheckedChange = jest.fn()
        render(<CheckboxCard checked={false} onCheckedChange={onCheckedChange} label="WhatsApp ή SMS" badge="Προτείνεται" />)

        const box = screen.getByRole("checkbox", { name: /WhatsApp ή SMS/ })
        expect(box).toHaveAttribute("aria-checked", "false")
        fireEvent.click(screen.getByText("Προτείνεται"))
        expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it("shows its body only while it is on, so typing in a field never flips the card", () => {
        const { rerender } = render(
            <CheckboxCard checked={false} onCheckedChange={() => {}} label="WhatsApp ή SMS">
                <input aria-label="Κινητό" />
            </CheckboxCard>
        )
        expect(screen.queryByLabelText("Κινητό")).toBeNull()

        rerender(
            <CheckboxCard checked onCheckedChange={() => {}} label="WhatsApp ή SMS">
                <input aria-label="Κινητό" />
            </CheckboxCard>
        )
        expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true")
        const field = screen.getByLabelText("Κινητό")
        expect(field.closest('[role="checkbox"]')).toBeNull()
    })

    it("explains a disabled card through its description and takes no click", () => {
        const onCheckedChange = jest.fn()
        render(
            <CheckboxCard checked={false} disabled onCheckedChange={onCheckedChange} label="Περίληψη" description="Δεν είναι διαθέσιμη ακόμη." />
        )

        const box = screen.getByRole("checkbox")
        expect(box).toBeDisabled()
        expect(box).toHaveAccessibleDescription("Δεν είναι διαθέσιμη ακόμη.")
        fireEvent.click(screen.getByText("Περίληψη"))
        expect(onCheckedChange).not.toHaveBeenCalled()
    })
})
