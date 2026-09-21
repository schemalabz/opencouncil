"use client";

import Combobox from "@/components/Combobox";

/**
 * The fields the picker can search by. Only `id` and `name` are required, so
 * a caller can pass a full Prisma `City` or a `{ id, name }` projection.
 */
export type CityComboboxOption = {
    id: string;
    name: string;
    name_en?: string | null;
    name_municipality?: string | null;
    name_municipality_en?: string | null;
};

/** The id of the "no city" row. A cuid never holds a null byte. */
const NO_CITY = "\u0000no-city";

type Option = { id: string; label: string; search: string };

type CommonProps<T extends CityComboboxOption> = {
    cities: T[];
    /** The id of the selected city. `null` means no city is selected. */
    value: string | null;
    /** Shown in the trigger while no city is selected. Defaults to `nullOption`. */
    placeholder?: string;
    searchPlaceholder?: string;
    emptyMessage?: string;
    /** Defaults to `city.name`. */
    getLabel?: (city: T) => string;
    disabled?: boolean;
    loading?: boolean;
    id?: string;
    className?: string;
};

type CityComboboxProps<T extends CityComboboxOption> = CommonProps<T> &
    (
        | {
              /**
               * The label of a row that selects no city, such as "All cities".
               * The row comes first and search never hides it.
               */
              nullOption: string;
              onChange: (cityId: string | null) => void;
          }
        | { nullOption?: undefined; onChange: (cityId: string) => void }
    );

function searchText(city: CityComboboxOption): string {
    return [city.name, city.name_en, city.name_municipality, city.name_municipality_en, city.id]
        .filter(Boolean)
        .join(" ");
}

/**
 * A searchable municipality picker over the shared `Combobox`, keyed by city
 * id. A picker that offers `nullOption` reports `null` when the user picks
 * that row. A picker without one always reports a city id, so it suits a
 * form field that has no "no city" state.
 */
export function CityCombobox<T extends CityComboboxOption>(props: CityComboboxProps<T>) {
    const {
        cities,
        value,
        nullOption,
        searchPlaceholder = "Search cities...",
        emptyMessage = "No city found.",
        getLabel,
        disabled,
        loading,
        id,
        className,
    } = props;

    const placeholder = props.placeholder ?? nullOption ?? "Select a city";

    const options: Option[] = cities.map((city) => ({
        id: city.id,
        label: getLabel ? getLabel(city) : city.name,
        search: searchText(city),
    }));
    if (nullOption !== undefined) {
        options.unshift({ id: NO_CITY, label: nullOption, search: nullOption });
    }

    // Combobox compares by reference, so the selected item must be the array's own object.
    const selectedId = value ?? (nullOption !== undefined ? NO_CITY : null);
    const selected = options.find((option) => option.id === selectedId) ?? null;

    return (
        <Combobox<Option>
            id={id}
            items={options}
            value={selected}
            onChange={(option) => {
                // Combobox reports null when the selected row is picked again.
                // Nothing changes then: the `nullOption` row selects no city.
                if (!option) return;
                if (option.id === NO_CITY) {
                    if (props.nullOption !== undefined) props.onChange(null);
                    return;
                }
                props.onChange(option.id);
            }}
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            emptyMessage={emptyMessage}
            getItemLabel={(option) => option.label}
            getItemValue={(option) => option.search}
            disabled={disabled}
            loading={loading}
            className={className}
        />
    );
}
