import type { Meta, StoryObj } from '@storybook/react';
import Card from './Card';

const meta: Meta<typeof Card> = {
  title: 'Design System/Card',
  component: Card,
  args: {
    heading: 'Situation Overview',
    eyebrow: 'Dashboard',
    children: (
      <p className="text-sm text-slate-600">
        Consistent, elevated surfaces improve scannability across the disaster management UI.
      </p>
    ),
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Elevated: Story = {
  args: {
    variant: 'elevated',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    padding: 'lg',
  },
};

export const Interactive: Story = {
  args: {
    interactive: true,
  },
};
