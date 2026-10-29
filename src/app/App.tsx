import { RouterProvider } from 'react-router/dom'
import { createStudioRouter } from '@/router/router'
import { StudioLayout } from '@/layouts/StudioLayout'
import { AppProviders } from './AppProviders'
import '@/styles/globals.css'

function ApplicationRoot() {
  return (
    <AppProviders>
      <StudioLayout />
    </AppProviders>
  )
}

export function createApplicationRouter(initialEntries?: string[]) {
  return createStudioRouter(ApplicationRoot, initialEntries)
}

let applicationRouter: ReturnType<typeof createApplicationRouter> | undefined

export default function App({ router }: { router?: ReturnType<typeof createApplicationRouter> }) {
  return <RouterProvider router={router ?? (applicationRouter ??= createApplicationRouter())} />
}
