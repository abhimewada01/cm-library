import * as SecureStore from 'expo-secure-store';
import type { Notice } from '../api/contracts';

function keyFor(studentId: string) { return `cm-library.notices.seen.${studentId}`; }

export async function getUnreadNoticeCount(studentId: string, notices: Notice[]) {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(studentId));
    const saved = raw ? JSON.parse(raw) as { lastSeenAt?: number; ids?: string[] } : {};
    const lastSeenAt = Number(saved.lastSeenAt || 0);
    const seenIds = new Set(saved.ids || []);
    return notices.filter((notice) => {
      const createdAt = Date.parse(notice.createdAt.replace(' ', 'T') + (notice.createdAt.includes('T') || /[zZ]|[+-]\d\d:\d\d$/.test(notice.createdAt) ? '' : 'Z')) || 0;
      return createdAt > lastSeenAt || (createdAt === lastSeenAt && !seenIds.has(notice.id));
    }).length;
  } catch { return notices.length; }
}

export async function markNoticesSeen(studentId: string, notices: Notice[]) {
  if (!notices.length) return;
  const ids = notices.slice(0, 300).map((notice) => notice.id);
  const newest = Math.max(...notices.map((notice) => Date.parse(notice.createdAt.replace(' ', 'T') + (notice.createdAt.includes('T') || /[zZ]|[+-]\d\d:\d\d$/.test(notice.createdAt) ? '' : 'Z')) || 0));
  await SecureStore.setItemAsync(keyFor(studentId), JSON.stringify({ lastSeenAt: newest, ids }));
}
