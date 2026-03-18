# Parking Lot Management System

A real-time parking lot management web application with Excel import/export, interactive map view, and multi-user collaboration.

## Features

- **Table View**: Excel-like interface with full CRUD operations
- **Map View**: Interactive canvas with drag-and-drop car placement and rotation
- **Multi-Sheet System**: Separate sheets for each parking lot
- **Real-time Collaboration**: WebSocket-based live updates
- **Excel Import/Export**: Import and export data in Excel format
- **Search & Filter**: Find cars across all parking lots
- **Authentication**: User login system
- **Responsive Design**: Works on mobile and desktop

## Tech Stack

- **Frontend**: Next.js 13.5.6, React 18.2.0, TailwindCSS
- **Backend**: Express 4.18.2, Socket.IO 4.6.2
- **Database**: SQLite (better-sqlite3 9.2.2)

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

This will start both the Next.js frontend (port 3000) and Express backend (port 3001).

## Production

```bash
npm run build
npm start
```

## Default Login

- Username: admin
- Password: admin123

## Database Schema

The application uses SQLite with the following tables:
- `users`: User authentication
- `vehicles`: Vehicle records with parking information
- `vehicle_positions`: Map positions and rotations for each vehicle
