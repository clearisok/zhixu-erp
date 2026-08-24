export type BuildInfo = {
  environment: "development" | "production";
  buildId: string;
  gitCommit: string;
  buildTime: string;
};

declare const __ZHIXU_BUILD_INFO__: BuildInfo;

export const buildInfo: BuildInfo = __ZHIXU_BUILD_INFO__;
