import { HashRouter, Routes, Route } from 'react-router';
import Layout from './components/Layout';
import { AuthGate } from './components/AuthGate';
import './index.css';

function App() {
  return (
    <AuthGate>
      <HashRouter>
        <Routes>
          <Route path="*" element={<Layout />} />
        </Routes>
      </HashRouter>
    </AuthGate>
  );
}

export default App;
