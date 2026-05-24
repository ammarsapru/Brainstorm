import { ArrowType, Connection } from '../../types';

/** DB stores arrow_start / arrow_end as booleans. */
export const connectionToDbRow = (conn: Connection, sessionId: string) => ({
  id: conn.id,
  session_id: sessionId,
  from_id: conn.fromId,
  to_id: conn.toId,
  style: conn.style,
  color: conn.color ?? null,
  relation_type: conn.relationType,
  label: conn.label ?? null,
  arrow_start: conn.arrowStart !== ArrowType.NONE,
  arrow_end: conn.arrowEnd !== ArrowType.NONE,
});

export const connectionFromDbRow = (row: Record<string, unknown>): Connection => ({
  id: row.id as string,
  fromId: row.from_id as string,
  toId: row.to_id as string,
  style: row.style as Connection['style'],
  color: (row.color as string) || undefined,
  relationType: row.relation_type as Connection['relationType'],
  label: (row.label as string) || undefined,
  arrowStart: row.arrow_start ? ArrowType.STANDARD : ArrowType.NONE,
  arrowEnd: row.arrow_end ? ArrowType.STANDARD : ArrowType.NONE,
});
