/** Safe build metadata returned by the public version endpoint. */
export interface OperationsVersionResponse {
  version: string;
  build: string;
  environment: "development" | "test" | "production";
}
