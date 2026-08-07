import type { Preview } from "@storybook/react";
import "@porphyra/tokens/css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "shell",
      values: [{ name: "shell", value: "#FBF8F5" }],
    },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  decorators: [
    (Story) => {
      document.documentElement.setAttribute("data-theme", "core");
      return Story();
    },
  ],
};

export default preview;
