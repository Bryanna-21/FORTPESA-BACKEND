/**
 * Prisma's known request errors (P2002 = unique constraint violation) are
 * exposed as a `code` property on the thrown error rather than a distinct
 * class we can `instanceof`-check without importing Prisma's runtime error
 * type. This narrow structural check is used everywhere a unique
 * constraint race is handled deliberately, rather than duplicating the
 * check inline in each call site.
 */
export function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}
