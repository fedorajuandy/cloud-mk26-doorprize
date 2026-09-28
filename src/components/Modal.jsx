import { onMount } from "solid-js";
export default function Modal(props) {
  let dialog;
  onMount(() => dialog.showModal());
  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!props.busy) props.close();
      }}
      aria-label={props.title}
    >
      <header>
        <h2>{props.title}</h2>
        <button
          type="button"
          class="icon-button"
          aria-label="Close dialog"
          disabled={props.busy}
          onClick={() => props.close()}
        >
          ×
        </button>
      </header>
      {props.children}
    </dialog>
  );
}
