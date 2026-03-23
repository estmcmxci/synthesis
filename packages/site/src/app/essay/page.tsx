import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Abstracted Self — emilemarcelagustin.eth",
  description:
    "Five sketches tracing selfhood within mediated reality. The loss of interiority, ersatz intimacy, ontological insecurity, anemoia, and identity recursion.",
};

export default function EssayPage() {
  return (
    <article className="px-8 md:px-16 py-16 md:py-24 max-w-2xl">
      {/* Header */}
      <header className="mb-12 animate-fade-up">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)] leading-tight">
          The Abstracted Self
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Five sketches tracing selfhood within mediated reality
        </p>
      </header>

      {/* Table of Contents */}
      <nav className="mb-12 animate-fade-up delay-1">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--color-ink-muted)] mb-3">
          Contents
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm text-[var(--color-ink-muted)]">
          <li><a href="#loss-of-interiority" className="hover:text-[var(--color-accent)] transition-colors">The Loss of Interiority</a></li>
          <li><a href="#ersatz-intimacy" className="hover:text-[var(--color-accent)] transition-colors">Ersatz Intimacy</a></li>
          <li><a href="#ontological-insecurity" className="hover:text-[var(--color-accent)] transition-colors">Ontological Insecurity</a></li>
          <li><a href="#anemoia" className="hover:text-[var(--color-accent)] transition-colors">Anemoia</a></li>
          <li><a href="#identity-recursion" className="hover:text-[var(--color-accent)] transition-colors">Identity Recursion</a></li>
        </ol>
      </nav>

      <div className="h-px bg-[var(--color-border)] mb-12 animate-fade-up delay-2" />

      {/* Preamble */}
      <div className="prose-essay animate-fade-up delay-3">
        <p>I can&rsquo;t imagine a day going by without scrolling through my feed, can you?</p>

        <p>Even on &ldquo;clean&rdquo; days, when we swear off screens, the instinct to thumb through the feed scratches at the mind like a nicotine itch. Stranger still, we accept it. Every normie and their grandma is yeeting eyeballs at the screen like it&rsquo;s a compulsive disorder.</p>

        <p>Everyone around you &mdash; at the gym, on the subway, crawling through traffic &mdash; is glued to their glowbie, absorbed in some absurd meme, vying for status through performed referentiality instead of just sitting in the moment itself.</p>

        <p>What I&rsquo;m more concerned with is the fact that a refusal to participate in this discourse inevitably leads to alienation. It cuts deep, which is why I can&rsquo;t judge others for taking part.</p>

        <p>Identity feels contingent on performativity &mdash; and it&rsquo;s farcical that in today&rsquo;s hyper-mediated world, we&rsquo;re left with just two options: opt out and face oblivion; or stay in and clown for clout.</p>

        <p>When the only alternative to the meme-mill is to fade out, the cost isn&rsquo;t just time &mdash; it&rsquo;s psychic torque: the chronic strain of keeping yourself available and legible to the algorithm.</p>

        <p>Over a decade spent trapped in mediated reality, I keep wondering: do I really need to post that meme just to feel real? I&rsquo;m sure I&rsquo;m not the only one.</p>

        <p>The ache you&rsquo;re sensing behind that question is what I call <strong>existential hyperesthesia</strong> &mdash; think Milan Kundera&rsquo;s &ldquo;unbearable lightness&rdquo; with push-notifications on.</p>

        <p>Existential hyperesthesia is an intense sensitivity to experience itself &mdash; evoking a psychosomatic overload induced by constant exposure to mediated reality, where existence jumps between hyper-visibility and the dread of erasure.</p>

        <p>Like a metaphysical superposition, the self is both seen and unseen at once.</p>

        <p>This manifests in many forms: anxiety, FOMO, daft attention, civic narcolepsy &mdash; nihilism and loneliness following close behind. But all symptoms of the same malaise: the loss of interiority.</p>

        {/* Pentaptych */}
        <h2 className="!mt-12">Pentaptych of the Abstracted Self</h2>

        <p>This essay traces a pentaptych pr&eacute;cis of the abstracted self &mdash; a self relegated by the feed, hollowed through performativity, and held captive beneath the algorithmic gaze. Each sketch, a vignette of existential disintegration:</p>

        <ol>
          <li><strong>The loss of interiority</strong>: the self hollowed by performative referentiality</li>
          <li><strong>Ersatz Intimacy</strong>: authenticity collapses into performativity</li>
          <li><strong>Ontological insecurity</strong>: the existential vertigo left in the wake</li>
          <li><strong>Anemoia</strong>: nostalgia as proxy for a pre-indexed ontology</li>
          <li><strong>Identity recursion</strong>: the self eroded through mediated iteration</li>
        </ol>

        {/* Sketch 1 */}
        <h2 id="loss-of-interiority" className="!mt-16">I. The Loss of Interiority</h2>

        <p>Let&rsquo;s use this shitpost as a trojan horse for a media-theory critique: &ldquo;Who would win &mdash; 100 men or 1 gorilla?&rdquo; Spoiler: the gorilla. Yet some aggro homie always swears <em>he&rsquo;d</em> survive, and the thread spirals &mdash; suddenly, you&rsquo;ve wasted an hour sparring with randos on X.</p>

        <p>It&rsquo;s an ego trap. The instigator feels like they&rsquo;re winning, but the only real victor is X&rsquo;s bottom line; performative engagement keeps the ad meter running while you get played TF out.</p>

        <p>This isn&rsquo;t harmless meme banter &mdash; it signals a deeper rot. The meme well has been poisoned. Captured platforms don&rsquo;t just curate what we see; they shape how we think, how we show up, and who we become.</p>

        <p>Ruby-Justice Thelot, in <em>Syzygy</em>, revisits Jauss&rsquo;s <em>horizon of expectations</em> &mdash; recasting it as a &ldquo;recursive horizon&rdquo; to show how each tech wave rewires our epistemology. He asks, <em>&lsquo;What is discarded in the name of novelty&rsquo;?</em></p>

        <p><strong>Interiority</strong> &mdash; the felt depth where identity, the moral body, and spiritual insight take root &mdash; is the private repository no feed can parse.</p>

        <p>Performativity has displaced interiority: a flattened subjectivity driven by external validation and mimetic desire. It hijacks the self &mdash; replacing authenticity with imitation. Performative discourse is mistaken for a relational salve &mdash; but only intensifies the <strong>existential hyperesthesia</strong> underneath.</p>

        <blockquote>
          <p>&lsquo;Over time, the art of posting begins to overtake the structures of our thought. We start to think in tweets, narrate our own lives in the cadence of this medium.&rsquo; &mdash; The Tragic Art of Posting</p>
        </blockquote>

        <p>Posting now serves to prove we exist outside ourselves; participation feels compulsory. Refuse to ape and you risk a metaphysical death. It becomes novocaine for the soul &mdash; momentary relief through performative engagement.</p>

        <p>But each hit hollows us out a little more, until raw existence feels unbearable without the drip. <strong>The less interiority we retain, the more unbearable it becomes.</strong></p>

        <p>We are vulnerable precisely because our sense of interiority has collapsed, leaving nothing solid to anchor us in lived experience.</p>

        <p>If the timeline guts the psyche, imagine how it corrodes friendships &mdash; once built on disclosure, now warped by a pathology of clout. When <em>individual subjectivity</em> collapses, the <strong>social fabric must follow.</strong></p>

        {/* Sketch 2 */}
        <h2 id="ersatz-intimacy" className="!mt-16">II. Ersatz Intimacy</h2>

        <p>As more of our relationships play out through public memes and performative referentiality, they drift &mdash; from disclosure to display. Affection becomes aesthetic; gestures become currency. Mediated reality gives rise to <strong>ersatz intimacy</strong>.</p>

        <p>In a past life &mdash; ante mediationem &mdash; I bonded with a motley crew of creatives, all wired with wanderlust, like me. In my na&iuml;vet&eacute;, I would fracture everything we built, though I didn&rsquo;t know it at the time. I&rsquo;d seen greener days.</p>

        <p>We made a one-of-a-kind record &mdash; gorgeously produced &mdash; featuring a vamp with a vocal range that rivaled Amy Winehouse&rsquo;s. It was only possible because we obstinately refused the mimetics du jour &mdash; at first.</p>

        <p>I cherish those sessions, but the bonds didn&rsquo;t last. Our pact, it turned out, wasn&rsquo;t immune to mimetic drift. Once we stepped beyond the hallowed grounds of our friendship, built on shared interiority, and into the panoptic arena of the music industry, we found ourselves under the gaze of an invisible audience we had long yearned for.</p>

        <p>That same yearning, stimmed by existential hyperesthesia, pulled us into the clout pit of the music industry. Just as it had made the aggro homies ape into the gorilla meme.</p>

        <p>We unwittingly swapped authenticity for performativity in the name of visibility. That choice killed the vibe &mdash; like a boiling frog, simmering whatever was left until the juice slipped out.</p>

        <p>By the time I caught it, the clout had gutted our craft &mdash; and I&rsquo;d baited my friends into the trap.</p>

        <p>I try not to be too hard on myself &mdash; after all, the system rewards visibility, not authenticity. And like anyone who has capitulated under the weight of existential hyperesthesia, I drift &mdash; losing interiority, slipping into ersatz intimacy, and watching friendship collapse into performativity.</p>

        <p>No one is immune to mimetic drift &mdash; not even the tightest circles. When relationships are mediated by platforms designed to mine for attention, they flatten.</p>

        <p>That&rsquo;s why I&rsquo;ve opted out and consigned myself to oblivion &mdash; because legibility, it turns out &mdash; was never the same thing as presence.</p>

        {/* Sketch 3 */}
        <h2 id="ontological-insecurity" className="!mt-16">III. Ontological Insecurity</h2>

        <p>Ghosting the world has its merits. One benefit of self-consigned social immolation is a return to presence &mdash; and the gradual encounter with personhood.</p>

        <p>Paradoxically, my orientation toward reality has since shifted &mdash; from an &lsquo;always on&rsquo; state to a felt sense of connection, where each thought and action recoils through the fabric of reality. From dissociation to resonance.</p>

        <p>In this state, I&rsquo;ve also realized what the incessant need for algorithmic legibility has done to relationships &mdash; especially those at the margins.</p>

        <p>Relational flattening &mdash; where gestures become currency and affection gives way to ersatz intimacy &mdash; has frayed the social fabric.</p>

        <p>All that&rsquo;s left are its skeuomorphic remnants.</p>

        <p>Modernity has led to asphyxiation &mdash; existential hyperesthesia &mdash; where the individual thirsts for recognition from the other by way of performative referentiality.</p>

        <p>A self that, if unseen, is unknowable &mdash; except when made explicit through exhibitionism. Thus, the self exists only in performance, never as a cause unto itself.</p>

        <p>The self becomes fractured, dissolving into a proxy for algorithmic legibility; identity is no longer rooted in being, but in whether one&rsquo;s actions can be indexed, ranked, and rendered visible.</p>

        <p>In this, the self is abstracted &mdash; of value only insofar as it conforms to <em>the diktat of rational utilitarianism, the logic underwriting our civilization&rsquo;s epistemology today.</em></p>

        <p>The recursive horizon marks a shift &mdash; from being to appearance &mdash; expressed as the loss of interiority: an evacuation of the self that can now only be known through mediated reality.</p>

        <p>And yet, the individual persists.</p>

        <p>But if the self collapses into appearance (or lack thereof), how can the self reconcile with itself? Once the individual consigns themselves to the physics of mediated reality, reconciliation can only occur within the medium itself.</p>

        <p>Recognition depends on visibility. Yet the terms of that visibility are arbitrarily set by the house rules.</p>

        <p>This structural dependency results in a loss of ontological autonomy &mdash; totalizing as <strong>ontological insecurity</strong>. That insecurity breeds existential hyperesthesia. And the feedback loops embedded in these cybernetic systems make the condition self-reinforcing: the more one seeks to anesthetize that insecurity through performative referentiality, the deeper the ontological wound becomes, hollowing out what remains of our interiority.</p>

        <p>And so, in sensing the loss of interiority, we reflexively attempt to restore it &mdash; unaware that we&rsquo;re doing so on terms not our own. Performative gesture becomes our default mode of expression, because we understand &mdash; phenomenologically &mdash; that what is indexed by the algorithm becomes legislated: visible, and therefore real.</p>

        <p>This performance is less expression than survival instinct though. Deep down, we know: if we are not indexed, we are not seen &mdash; and if we are not seen, we are not real.</p>

        <p>Every act becomes a struggle for survival; every post, every share, a small, desperate cry: <em>I exist. I matter. Please, notice me.</em></p>

        {/* Sketch 4 */}
        <h2 id="anemoia" className="!mt-16">IV. Anemoia</h2>

        <p>What will life be like 100 years from now, when our existence is fully subsumed by mediated reality?</p>

        <p>Some readers are old enough to remember dial-up internet &mdash; or further back, when we dialed up our crushes on landlines, maybe even rotary phones.</p>

        <p>Back then, anticipation filled in the gaps. Waiting for the result was part of the experience. In that pause &mdash; a moment for reflection, for wonder &mdash; possibilities felt infinite. Unpredictability was arousing.</p>

        <p>Today, those gaps have been sanded down. Wishes are granted instantaneously &mdash; buffing out tension, eustress and all. No build-up, no yearning, no room left to dream.</p>

        <p>Is it surprising, then, that alt culture has embraced Y2K aesthetics? Low-rise jeans, baby tees, butterfly clips, velour tracksuits, flip phones, gossamer iMacs, pixel fonts, pastel pinks &mdash; all nostalgic for &lsquo;simpler times,&rsquo; before mediated reality took root.</p>

        <p>Or is it something even more primordial we&rsquo;re yearning for, expressing itself through our aesthetic choices &mdash; not merely a fashion preference, but the symptomatology of a way of life that no longer exists?</p>

        <p>Why do we reach back to relive a past that has never been? Because <strong>anemoia</strong> &mdash; nostalgia for imagined memory &mdash; serves as a proxy for a pre-indexed ontology.</p>

        <p>This is captured perfectly by alt-culture darling Frank Ocean, whose now-iconic, almost ecclesiastic artifact &lsquo;Blonde&rsquo; riffs on these motifs of anemoia, recursion, and existential drift.</p>

        <p>Just picture it: a bushwick twink or corecore sadboy posted up, Blonde soundtracking their lives, not just as signal but as sacrament &mdash; a ritual act of reconstruction. Healing through resonance.</p>

        <p>Streaming <em>Blonde</em> becomes a s&eacute;ance for interiority &mdash; a search for a self that once blossomed off-grid.</p>

        <p>But what exactly are they healing from? I have a theory: the loss of interiority, the greatest ontological wound of all.</p>

        {/* Sketch 5 */}
        <h2 id="identity-recursion" className="!mt-16">V. Identity Recursion</h2>

        <p>Distraction, dissociation, ambivalence &mdash; they&rsquo;re no longer just endemic. They&rsquo;re metastasizing. The danger in outsourcing identity to mediated reality is semantic degradation: not just the distortion of meaning, but its erasure. All that remains are contours.</p>

        <p>This is hauntingly &mdash; perhaps even prophetically &mdash; demonstrated in Alvin Lucier&rsquo;s 1969 piece <em>I Am Sitting in a Room</em>. In it, Lucier records himself reading a short text aloud, then plays it back into the room and re-records it &mdash; again and again &mdash; for nearly forty-five minutes.</p>

        <p>With each loop, meaning disintegrates &mdash; from spoken word to an indistinguishable hum. The linguistic signal is gradually overwritten by the acoustic signature of the room.</p>

        <p>Likewise, the self, under recursive mediation, begins to fade out of existence and into abstraction &mdash; an abstraction shaped by the perverse register of platform incentives engineered to frack for attention.</p>

        <p>Each &ldquo;iteration&rdquo; &mdash; a post, a share, a like &mdash; surreptitiously shifts our self-perception, compounding disassociation and inducing superposition: a state now classically expressed as existential hyperesthesia.</p>

        <p>This process is known as <strong>identity recursion</strong> &mdash; a self eloped in a prism of performativity. When we look back at ourselves, mediated by the algorithmic gaze, our identity fractures through recursive acts of performative referentiality.</p>

        {/* Conclusion */}
        <h2 className="!mt-16">Conclusion</h2>

        <p><strong>To recap</strong>: we began with an observation &mdash; participation in mediated reality now feels obligatory. Identity has become structurally dependent on performativity, as the recursive horizon marks a shift from being to appearance.</p>

        <p>The self now orients around a single realization: that quelling existential hyperesthesia depends on algorithmic legibility. This ontological shift has hollowed out interiority and collapsed relationships into ersatz intimacy &mdash; all of it tracing back to a single root cause: ontological insecurity.</p>

        <p>That wound has expressed itself in alt-culture as an embrace of Y2K aesthetics &mdash; an anemoiac form factor, illicitly manifesting as the symptomatology of a lifeworld that no longer exists.</p>

        <p>Yet the existential pain persists, as the development of identity remains bound to and circumscribed by mediated reality. And so it goes: the abstracted self, a stranger in a strange land with no apparent home.</p>

        <blockquote>
          <p>Viviendo en un universo que la ciencia vuelve cada d&iacute;a m&aacute;s abstracto, entre t&eacute;cnicas que lo someten a comportamientos recientemente abstractos, en medio de un hacinamiento humano que impone relaciones progresivamente abstractas, el hombre actual trata de escapar a esa abstracci&oacute;n, que le escamotea el mundo y le apergamina el alma, so&ntilde;ando en el futuro &mdash; ese abstracto entre los abstractos. &mdash; Breviario de Escolios p.95</p>
        </blockquote>

        <p className="text-[var(--color-ink-muted)] italic">This essay has merely glossed over how we arrived at this ontological wound &mdash; this world of abstraction among abstractions. To truly understand how we got here, we&rsquo;ll need to render a genealogy of ontology, a longue dur&eacute;e of western thought: from Homeric myth to Cartesian rupture, from Kantian categories to the recursive loops of hyperstition &mdash; our present moment.</p>
      </div>
    </article>
  );
}
