import type { Metadata } from 'next';
import { EventBrainWorkspace } from './workspace';

export const metadata: Metadata = {
  title: 'Prepare an event — Liltwise',
  description: 'Build an event-aware speaking script from the context you provide.',
};

export default function PreparePage() {
  return <EventBrainWorkspace />;
}
