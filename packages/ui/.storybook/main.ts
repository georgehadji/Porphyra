import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  // Light theme only, by product decision — see packages/tokens. No
  // dark-mode toggle addon; adding one would suggest a mode this product
  // deliberately doesn't have.
};

export default config;
