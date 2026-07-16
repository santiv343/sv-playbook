export interface JsonResponse {
  statusCode: number | undefined;
  body: string;
}

export interface CollectedProcess {
  status: number | null;
  stdout: string;
  stderr: string;
}
