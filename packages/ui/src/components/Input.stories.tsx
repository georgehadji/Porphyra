import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  args: { label: "Email address", placeholder: "you@example.com" },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: "We'll only use this to send verification." } };
export const WithError: Story = {
  args: { errorMessage: "Enter a valid email address.", defaultValue: "not-an-email" },
};
