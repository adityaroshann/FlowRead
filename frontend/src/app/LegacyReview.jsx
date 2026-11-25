import { Navigate, useParams } from 'react-router-dom';

/** /access/review/:id (old staff path) -> /workspace/review/:id */
export default function LegacyReview() {
  const { id } = useParams();
  return <Navigate to={`/workspace/review/${encodeURIComponent(id)}`} replace />;
}
