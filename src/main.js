// Entry point.
//
// Deliberately nothing but a call: everything else lives in app.js so that
// module can be imported by tests without booting the application.
import './styles.css';
import { startApp } from './app.js';

startApp();
