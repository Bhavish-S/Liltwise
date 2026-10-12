import { createRoot } from 'react-dom/client';
import { Teleprompter } from './Teleprompter';
import { Workspace } from './Workspace';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('The Liltwise renderer could not find its root element.');

const view = new URLSearchParams(window.location.search).get('view');
createRoot(root).render(view === 'teleprompter' ? <Teleprompter /> : <Workspace />);
