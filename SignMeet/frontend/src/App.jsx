import { Route, Routes } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import HomePage from './pages/HomePage';
import TranslatePage from './pages/TranslatePage';
import LoginPage from './pages/LoginPage';
import SessionPage from './pages/SessionPage';
import ThankYouPage from './pages/ThankYouPage';

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/translate" element={<TranslatePage />} />
        <Route path="/translate/session/:meetingId" element={<SessionPage />} />
        <Route path="/thank-you" element={<ThankYouPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>
    </Routes>
  );
}

export default App;
