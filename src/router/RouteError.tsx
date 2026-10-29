import { useRouteError, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'

import { paths } from './paths'

export function RouteErrorPage() {
  const error = useRouteError(),
    navigate = useNavigate()
  return (
    <section role="alert" className="p-8">
      <h1 className="font-semibold">无法打开此页面</h1>
      <p className="my-4 text-sm">{error ? errorMessage(error) : '页面地址不存在或参数无效。'}</p>
      <Button variant="outline" onClick={() => void navigate(paths.diaries)}>
        返回日记
      </Button>
    </section>
  )
}
