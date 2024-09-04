import React from 'react';
import { Button } from "./ui/button";
import { useTranslations } from 'next-intl';
import FormSheet from './FormSheet';
interface ListProps<T, P = {}> {
    items: T[];
    ItemComponent: React.ComponentType<{ item: T, editable: boolean } & P>;
    FormComponent: React.ComponentType<any>;
    formProps: any;
    editable: boolean;
    t: (key: string, params?: any) => string;
    itemProps?: P;
}

export default function List<T, P = {}>({ items, editable, ItemComponent, FormComponent, formProps, t, itemProps }: ListProps<T, P>) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
                <p className="text-muted-foreground">{t('items', { count: items.length })}</p>
                {editable && (
                    <FormSheet FormComponent={FormComponent} formProps={formProps} title={t('addItem', { title: t('item') })} type="add" />
                )}
            </div>
            {items.length > 0 ? (
                <div className="grid gap-6">
                    {items.map((item, index) => (
                        <ItemComponent key={index} item={item} editable={editable} {...itemProps as P} />
                    ))}
                </div>
            ) : (
                <p className="text-gray-600">{t('noItems', { title: t('item') })}</p>
            )}
        </div>
    );
}
