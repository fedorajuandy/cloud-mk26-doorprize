import { createEffect, createSignal, Show } from "solid-js";
export default function ParticipantPicture(props) {
  const [failed, setFailed] = createSignal(false);
  createEffect(() => {
    props.src;
    setFailed(false);
  });
  return (
    <Show
      when={props.src && !failed()}
      fallback={
        <span class="muted">{props.src ? "Image unavailable" : "—"}</span>
      }
    >
      <img
        src={props.src}
        alt="Participant profile"
        width="40"
        height="40"
        loading="lazy"
        referrerpolicy="no-referrer"
        style={{ "object-fit": "cover", "border-radius": "50%" }}
        onError={() => setFailed(true)}
      />
    </Show>
  );
}
