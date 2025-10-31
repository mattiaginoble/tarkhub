import React from "react";

interface AddModBarProps {
  modUrl: string;
  setModUrl: (url: string) => void;
  addMod: (e: React.FormEvent<HTMLFormElement>) => void;
  currentList: string;
}

const AddModBar: React.FC<AddModBarProps> = ({
  modUrl,
  setModUrl,
  addMod,
  currentList,
}) => (
  <form onSubmit={addMod} className="add-mod-form-compact">
    <input
      type="text"
      placeholder="Add mod link here…"
      value={modUrl}
      onChange={(e) => setModUrl(e.target.value)}
      className="mod-url-input"
      disabled={!currentList}
    />
    <button type="submit" className="btn-primary" disabled={!currentList}>
      Add Mod
    </button>
  </form>
);

export default AddModBar;
