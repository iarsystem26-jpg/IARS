import { useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { PageSkeletonForRoute } from './PageLoading';
import { AppLoading } from './Skeleton';

export default function RouteLoading({ embedded = false, label = 'Loading page' }: { embedded?: boolean; label?: string }) {
  const { pathname, search } = useLocation();
  const { profile } = useAuth();
  return <AppLoading label={label} embedded={embedded}>
    <PageSkeletonForRoute pathname={pathname} search={search} role={profile?.role} />
  </AppLoading>;
}
