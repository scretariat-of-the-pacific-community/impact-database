import type { Meta, StoryObj } from '@storybook/react';
import FormField from './FormField';

const meta: Meta<typeof FormField> = {
  title: 'Design System/FormField',
  component: FormField,
  args: {
    label: 'Location',
    htmlFor: 'location',
    children: (
      <input
        id="location"
        type="text"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        placeholder="e.g., Port Vila, Vanuatu"
      />
    ),
  },
};

export default meta;
type Story = StoryObj<typeof FormField>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    hint: 'Use at least 3 characters',
  },
};

export const WithError: Story = {
  args: {
    error: 'Location is required',
  },
};
