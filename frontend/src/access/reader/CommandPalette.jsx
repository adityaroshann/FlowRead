import {
  Autocomplete,
  Collection,
  Dialog,
  Header,
  Input,
  Menu,
  MenuItem,
  MenuSection,
  Modal,
  ModalOverlay,
  SearchField,
  useFilter,
} from 'react-aria-components';
import { Search } from 'lucide-react';

/**
 * Ctrl/Cmd+K palette. `groups` = [{ id, title, items: [{ id, label, hint?, icon?, run }] }].
 * Typing filters every group; Enter runs the highlighted command.
 */
export default function CommandPalette({ isOpen, onOpenChange, groups, onRun }) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const byId = new Map();
  for (const g of groups) for (const it of g.items) byId.set(it.id, it);

  return (
    <ModalOverlay className="modal-overlay cmd-overlay" isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Modal className="modal cmd-modal">
        <Dialog className="cmd" aria-label="Commands">
          <Autocomplete filter={contains}>
            <SearchField className="cmd-search" aria-label="Search commands and sections" autoFocus>
              <Search size={18} aria-hidden="true" className="cmd-search-icon" />
              <Input className="cmd-input" placeholder="Jump to a section, switch profile, download…" />
              <span className="kbd cmd-esc" aria-hidden="true">
                Esc
              </span>
            </SearchField>
            <Menu
              className="menu cmd-menu"
              items={groups}
              onAction={(key) => {
                const it = byId.get(key);
                onOpenChange(false);
                if (it) requestAnimationFrame(() => (onRun ? onRun(it) : it.run?.()));
              }}
              renderEmptyState={() => <p className="cmd-empty">No matching commands.</p>}
            >
              {(group) => (
                <MenuSection id={group.id} className="cmd-section">
                  <Header className="cmd-header">{group.title}</Header>
                  <Collection items={group.items}>
                    {(it) => (
                      <MenuItem id={it.id} className="menu-item cmd-item" textValue={`${it.label} ${it.keywords || ''}`}>
                        {it.icon ? <it.icon size={16} aria-hidden="true" /> : <span className="cmd-icon-gap" aria-hidden="true" />}
                        <span className="cmd-label">{it.label}</span>
                        {it.hint && <span className="cmd-hint">{it.hint}</span>}
                      </MenuItem>
                    )}
                  </Collection>
                </MenuSection>
              )}
            </Menu>
          </Autocomplete>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
