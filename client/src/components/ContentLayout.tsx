import { Outlet } from 'react-router'

// The standard page width, for every signed-in page except the ticket split view
function ContentLayout() {
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <Outlet />
    </div>
  )
}

export default ContentLayout
