import React, { useState } from 'react';
import FormSheet from './FormSheet';
import { Search } from "lucide-react";
import { Input } from '@/components/ui/input';

interface ListProps<T, P = {}> {
    items: T[];
    ItemComponent: React.ComponentType<{ item: T, editable: boolean } & P>;
    FormComponent: React.ComponentType<any>;
    formProps: any;
    editable: boolean;
    t: (key: string, params?: any) => string;
    itemProps?: P;
    smColumns?: number;
    mdColumns?: number;
    lgColumns?: number;
}

export default function List<T extends { id: string }, P = {}>({
    items,
    editable,
    ItemComponent,
    FormComponent,
    formProps,
    t,
    itemProps,
    smColumns = 1,
    mdColumns = 1,
    lgColumns = 2,
}: ListProps<T, P>) {
    const [searchQuery, setSearchQuery] = useState("");

    const gridClasses = `grid gap-6 ${smColumns === 1 ? 'grid-cols-1' : `grid-cols-${smColumns}`
        } ${mdColumns === 1 ? 'md:grid-cols-1' : `md:grid-cols-${mdColumns}`
        } ${lgColumns === 2 ? 'lg:grid-cols-2' : `lg:grid-cols-${lgColumns}`
        }`;

    const filteredItems = items.filter((item) =>
        Object.values(item).some(
            (value) =>
                typeof value === 'string' &&
                value.toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    return (
        <div className="space-y-0 md:space-y-4">
            <div className="flex justify-between items-center mb-4">
                <p className="text-muted-foreground">{t('items', { count: filteredItems.length })}</p>
                {editable && (
                    <FormSheet FormComponent={FormComponent} formProps={formProps} title={t('addItem', { title: t('item') })} type="add" />
                )}
            </div>
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                    placeholder={t('searchItems')}
                    className="pl-10 w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            {filteredItems.length > 0 ? (
                <div className={gridClasses}>
                    {filteredItems.map((item, index) => (
                        <ItemComponent key={item.id} item={item} editable={editable} {...itemProps as P} />
                    ))}
                </div>
            ) : (
                <p className="text-gray-600">{t('noItems', { title: t('item') })}</p>
            )}
        </div>
    );
}
