import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import React from 'react';
import { Collection } from '@/components/Collection';
import { db } from '@/lib/db';
import { Button, Chip, Row, Txt } from '@/components/ui';

interface Note { id: string; title: string | null; body: string | null; url: string | null; pinned: boolean; updated_at: string }

export default function Notes() {
  return (
    <>
      <Stack.Screen options={{ title: 'Notes' }} />
      <Collection<Note>
        table="notes" title="Notes" icon="document-text-outline" subtitle="Ideas, links, lists, things to remember."
        emptyText="Write anything down."
        order={{ column: 'updated_at' }}
        sort={(a, b) => Number(b.pinned) - Number(a.pinned)}
        fields={[
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'body', label: 'Note', type: 'multiline' },
          { key: 'url', label: 'Link (optional)', type: 'url' },
          { key: 'pinned', label: 'Pin to top', type: 'bool' },
        ]}
        defaults={{ pinned: false }}
        transform={(v) => (!v.title && !v.body && !v.url ? { ...v, title: 'Untitled' } : v)}
        itemTitle={(n) => `${n.pinned ? '📌 ' : ''}${n.title || (n.body ?? '').split('\n')[0].slice(0, 60) || 'Note'}`}
        itemSub={(n) => (n.title ? (n.body ?? '').slice(0, 120) : null)}
        itemExtra={(n) => <Row>
          {n.url ? <Button small kind="ghost" label="Open link" onPress={() => Linking.openURL(n.url!)} /> : null}
          <Chip label={n.pinned ? 'Unpin' : 'Pin'} onPress={() => db.update('notes', n.id, { pinned: !n.pinned })} />
        </Row>}
      />
    </>
  );
}
