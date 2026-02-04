# Binocular Vision Rehab (Software)

## Project Overview
This project is a web-based application designed for **Binocular Vision Rehabilitation**. It utilizes advanced computer vision via MediaPipe to track eye movements in real-time, providing quantitative analysis of binocular functions such as convergence velocity and movement symmetry.

## Key Features
- **Real-time Eye Tracking**: precise iris detection using MediaPipe Face Landmarker.
- **Quantitative Metrics**: 
  - **Velocity**: Measure convergence/divergence speed in mm/s.
  - **Symmetry**: Analyze the movement balance between left and right eyes.
- **Interactive Dashboard**: Real-time data visualization with charts and status indicators.
- **Web-Based Accessibility**: Built on modern web technologies for easy deployment and access without heavy installation.

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS (Dark Mode / Glassmorphism)
- **Computer Vision**: @mediapipe/tasks-vision
- **State Management**: Zustand
- **Charts**: Recharts

## Getting Started

### Prerequisites
- Node.js 18+ installed

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/myoung906/bino_rehab.git
   ```
2. Navigate to the web directory:
   ```bash
   cd web
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

## License
[License Information Here]
