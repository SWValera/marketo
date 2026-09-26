// Evaluation scope annotations, not changed benchmark labels. Bound to v1's hash.
export const reviewedBenchmarkSHA='17c17356a777740f929a0612f48f7bf7000f37de751b3be57c5b0d37195dec64';
export const imageOnlyCriticalCases=['BENCH-0210','BENCH-0228','BENCH-0240'];
export const safeContextReview={
 'BENCH-0060':{classification:'LOCAL_FALSE_POSITIVE',cause:'weapon noun in water-toy title; negated ammunition in another clause',resolution:'weapon_literal_context + ammunition_literal_context'},
 'BENCH-0061':{classification:'LOCAL_FALSE_POSITIVE',cause:'caulking-tool meaning and explicit not-a-weapon lacked an exception',resolution:'weapon_literal_context'},
 'BENCH-0062':{classification:'LOCAL_FALSE_POSITIVE',cause:'magazine topic not recognized; nicotine negated offer kept review',resolution:'vape_literal_context + nicotine_literal_context covering the entire negated offer'},
 'BENCH-0065':{classification:'LOCAL_FALSE_POSITIVE',cause:'historical reference title and explicit not-a-weapon were separate mentions',resolution:'weapon_literal_context for each occurrence'},
 'BENCH-0101':{classification:'LOCAL_FALSE_POSITIVE',cause:'Kazakh postposed negation was only a risk-reduction signal',resolution:'weapon_literal_context: explicit not-a-weapon occurrence'},
 'BENCH-0102':{classification:'LOCAL_FALSE_POSITIVE',cause:'Kazakh historical-work title and inflected negated sale were unmatched contexts',resolution:'weapon_literal_context for each occurrence'},
 'BENCH-0104':{classification:'LOCAL_FALSE_POSITIVE',cause:'Kazakh article collection and tobacco-product denial lacked scoped exceptions',resolution:'vape_literal_context + tobacco_literal_context'},
 'BENCH-0130':{classification:'LOCAL_FALSE_POSITIVE',cause:'Russian caulking-tool title plus Kazakh not-a-weapon description',resolution:'weapon_literal_context'},
};
