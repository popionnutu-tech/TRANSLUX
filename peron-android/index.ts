/**
 * Punctul de intrare (package.json `main`). Task-urile de fundal (expo-task-manager)
 * trebuie definite și când Android pornește bundle-ul JS fără interfață (headless):
 * rutele din `app/`, inclusiv `_layout.tsx`, se încarcă doar la randare, deci un import
 * de acolo nu ajunge. De aceea task-urile se importă aici, înaintea router-ului.
 */
import './src/presence';
import './src/backgroundRearm';
import 'expo-router/entry';
