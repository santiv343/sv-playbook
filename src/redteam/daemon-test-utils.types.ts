// Tipos mínimos para las fixtures de daemon-test-utils.test.support.ts —
// JsonResponse envuelve una respuesta HTTP cruda, CollectedProcess el
// resultado de un subproceso spawneado (daemon real levantado como child).
export interface JsonResponse {
  statusCode: number | undefined;
  body: string;
}

export interface CollectedProcess {
  status: number | null;
  stdout: string;
  stderr: string;
}
