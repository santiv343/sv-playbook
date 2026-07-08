export class StoreVersionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreVersionError';
  }
}
