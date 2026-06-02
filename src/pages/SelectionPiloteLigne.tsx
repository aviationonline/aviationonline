export default function SelectionPiloteLigne() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-20">

      <h1 className="text-5xl font-bold mb-8">
        Préparation aux sélections pilote de ligne
      </h1>

      <p className="text-xl mb-8">
        Préparez efficacement vos sélections compagnies aériennes grâce à une
        maîtrise approfondie des procédures IFR, de la gestion de la charge de
        travail et des connaissances techniques attendues lors des évaluations.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Pourquoi les sélections compagnies sont exigeantes ?
      </h2>

      <p className="mb-6">
        Les compagnies aériennes recherchent des pilotes capables d'appliquer
        des procédures rigoureuses, de gérer une charge de travail importante
        et de démontrer une parfaite compréhension des opérations IFR.
      </p>

      <p className="mb-6">
        Une excellente maîtrise du pilotage aux instruments constitue souvent
        un facteur déterminant lors des entretiens techniques, des évaluations
        sur simulateur et des assessments.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Ce que couvre la formation
      </h2>

      <ul className="list-disc pl-6 space-y-2">
        <li>Procédures IFR complètes</li>
        <li>SID et STAR</li>
        <li>Approches ILS</li>
        <li>Approches RNAV GNSS</li>
        <li>Attentes</li>
        <li>Radionavigation VOR, NDB, DME</li>
        <li>Facteurs humains</li>
        <li>Gestion de la charge de travail</li>
        <li>Analyse des erreurs fréquentes</li>
        <li>Préparation aux évaluations techniques compagnies</li>
      </ul>

      <h2 className="text-3xl font-bold mt-12 mb-4">
        Une expérience unique
      </h2>

      <p className="mb-6">
        La formation a été conçue par Jean-Claude Chenard, instructeur IFR /
        MCCI, fort de plus de 25 000 heures d'instruction sur simulateur et de
        plus de 35 années d'expérience dans la formation des pilotes
        professionnels.
      </p>

      <h2 className="text-3xl font-bold mt-12 mb-6">
        Questions fréquentes
      </h2>

      <div className="space-y-6">

        <div>
          <h3 className="text-xl font-bold mb-2">
            Cette formation est-elle adaptée aux sélections Air France ?
          </h3>
          <p>
            Oui. Les connaissances IFR et la rigueur procédurale abordées dans
            la formation sont directement utiles lors des évaluations de type
            compagnie aérienne.
          </p>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2">
            Convient-elle aux pilotes CPL ou ATPL ?
          </h3>
          <p>
            Oui. La formation est particulièrement adaptée aux pilotes CPL,
            ATPL théorique ou titulaires d'une qualification IR.
          </p>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2">
            Les vidéos sont-elles accessibles en illimité ?
          </h3>
          <p>
            Oui. L'accès à la formation est illimité afin de permettre des
            révisions régulières avant une sélection.
          </p>
        </div>

      </div>

      <div className="mt-12">
        <a
          href="/login"
          className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold"
        >
          Accéder à la formation
        </a>
      </div>

    </div>
  );
}
