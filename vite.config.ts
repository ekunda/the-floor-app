import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [react()],
	base: '/the-floor-app/', // nazwa repo na GitHubie
})
