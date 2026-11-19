import { withCrapTypescriptVitest } from "@barney-media/crap-typescript-vitest";

export default withCrapTypescriptVitest(
  {
    test: {
      include: ["src/**/*.test.ts"],
    },
  },
  {
    threshold: 10,
  },
);
