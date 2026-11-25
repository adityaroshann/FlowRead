import { useParams } from 'react-router-dom';
import { ReviewWorkspace } from '../access/staff/ReviewPage.jsx';

/** /read/:id/edit: fix headings, tables and image descriptions, then go back to reading. */
export default function EditDoc() {
  const { id } = useParams();
  return <ReviewWorkspace key={id} id={id} mode="personal" />;
}
